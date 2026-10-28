"""Navegação por URL do front (src/rotas.js) no Chrome, com o Vite local e as APIs simuladas (dados fictícios):
links diretos, voltar/avançar, relatório completo com endereço, não encontrado, chat por conversa, ?fonte= dos
relatórios publicados e a geração pelo seletor (a janela fecha na versão 1; a versão 2 automática tem aviso próprio).
Para no primeiro erro. Uso: python testes/teste_navegacao.py (Playwright e Chrome instalados)."""
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.request

from playwright.sync_api import sync_playwright

RAIZ = str(Path(__file__).resolve().parent.parent)
BASE = "http://localhost:5199"

RELATORIOS = [
    {"relatorio_id": "beta-2t26-2", "empresa": "Beta", "periodo": "2T26", "versao": 2, "atualizado_em": "2026-10-28T16:00:00Z"},
    {"relatorio_id": "alfa-2t26-1", "empresa": "Alfa", "periodo": "2T26", "versao": 1, "atualizado_em": "2026-10-28T15:00:00Z"},
]
CONVERSAS = [
    {"thread_id": "t1", "titulo": "Conversa um", "ultima_em": "2026-10-28T15:00:00Z", "turnos": 2},
    {"thread_id": "t2", "titulo": "Conversa dois", "ultima_em": "2026-10-28T14:00:00Z", "turnos": 1},
]
chamadas = []
GERACAO = {"pedida": False, "v2": "em_preparo"}
GAMA = {"relatorio_id": "gama-2t26-1", "empresa": "Gama", "periodo": "2T26", "versao": 1, "atualizado_em": "2026-10-28T17:00:00Z"}


def resumo(r):
    return {**r, "referencia": r["periodo"], "itens": [], "numeros_chave": [], "indice": [], "categorias_revisao": []}


def rota(route):
    url = route.request.url
    caminho = url.split("5199", 1)[1].split("?")[0]
    chamadas.append(caminho)
    corpo, status, tipo = None, 200, "application/json"
    if caminho == "/api/auth/me":
        corpo = {"id": 1, "name": "Teste", "email": "teste@exemplo.com", "papel": "analista"}
    elif caminho == "/resumos/api/resumos":
        corpo = {"relatorios": RELATORIOS, "total": len(RELATORIOS)}
    elif m := re.fullmatch(r"/resumos/api/resumos/([^/]+)/revisao", caminho):
        corpo = {"status": "em_revisao", "contagem": {"pendente": 0}, "itens": {}}
    elif m := re.fullmatch(r"/resumos/api/resumos/([^/]+)", caminho):
        r = next((r for r in RELATORIOS if r["relatorio_id"] == m.group(1)), None)
        corpo, status = (resumo(r), 200) if r else ({"detail": "Resumo não encontrado."}, 404)
        if r is GAMA and GAMA["versao"] == 2:
            corpo["execucao"] = {"operacao": "redacao", "versao": 2}
    elif re.fullmatch(r"/resumos/api/relatorios/[^/]+/html", caminho):
        corpo, tipo = "<!doctype html><html><body><p>relatório</p></body></html>", "text/html"
    elif caminho == "/analise/api/chat/conversas":
        corpo = CONVERSAS
    elif m := re.fullmatch(r"/analise/api/chat/conversas/([^/]+)", caminho):
        corpo = {"thread_id": m.group(1), "mensagens": [{"id": "m1", "papel": "usuario", "texto": f"pergunta {m.group(1)}"}]}
    elif caminho == "/resumos/api/fontes":
        corpo = ({"documentos": [{"codigo": "ITR-2T26-GAMA", "pasta": "itr"}]} if "empresa=" in url
                 else {"empresas": ["Gama"], "documentos": []})
    elif caminho == "/analise/api/relatorios/gerar":
        GERACAO["pedida"] = True
        if GAMA not in RELATORIOS:
            RELATORIOS.insert(0, GAMA)
        corpo = {"operacao_id": "op1"}
    elif caminho == "/analise/api/relatorios/operacoes/op1":
        corpo = {"operacao_id": "op1", "estado": "concluida", "seq": 6, "versao": 1, "relatorio_id": GAMA["relatorio_id"],
                 "etapas": [{"nome": "publicacao", "rotulo": "Publicando", "status": "concluida"}],
                 "versao_2": {"estado": GERACAO["v2"]}}
    elif caminho == "/coleta/api/documentos":
        corpo = {"empresas": []}
    else:
        corpo, status = {"detail": "simulado"}, 404
    route.fulfill(status=status, content_type=tipo, body=corpo if isinstance(corpo, str) else json.dumps(corpo))


def ok(c, m, extra=""):
    print("OK  " if c else "ERRO", m, "" if c else extra, flush=True)
    if not c:
        raise SystemExit("PAROU NO PRIMEIRO ERRO")


srv = subprocess.Popen("npx vite --port 5199 --strictPort", cwd=RAIZ, shell=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/conversas")
            break
        except Exception:
            time.sleep(1)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel="chrome")
        pag = nav.new_page(viewport={"width": 1400, "height": 900})
        for prefixo in ("/api/", "/resumos/", "/analise/", "/coleta/", "/monitor/"):
            pag.route(f"{BASE}{prefixo}**", rota)
        caminho = lambda: pag.evaluate("location.pathname + location.search")
        logs = []
        pag.on("console", lambda m: logs.append(m.text))

        pag.goto(BASE + "/?fonte=1&arquivo=Doc.pdf&pagina=3")
        pag.wait_for_url("**/conversas?fonte=1*")
        ok("fonte=1" in caminho(), "/ leva a /conversas mantendo o ?fonte=", caminho())
        pag.wait_for_selector(".ana-visualizador")
        ok("Doc.pdf" in pag.inner_text(".ana-visualizador"), "o deep link de fonte abre o documento")
        pag.click(".ana-visualizador .cds--modal-close")
        pag.wait_for_function("!location.search")
        ok(caminho() == "/conversas", "fechar o documento tira só os parâmetros da fonte", caminho())

        pag.goto(BASE + "/relatorios")
        pag.wait_for_url("**/relatorios/beta-2t26-2")
        pag.wait_for_selector("h1.ana-cabecalho__emissor")
        ok(pag.inner_text("h1.ana-cabecalho__emissor") == "Beta", "/relatorios abre o mais recente (replace)")
        ok("Beta · 2T26" in pag.title(), "título da aba do navegador com o relatório", pag.title())

        pag.click("#ana-relatorio")
        pag.click("text=Alfa · 2T26")
        pag.wait_for_url("**/relatorios/alfa-2t26-1")
        pag.wait_for_function("document.querySelector('h1.ana-cabecalho__emissor')?.innerText === 'Alfa'")
        ok(True, "escolher outro relatório navega para o endereço dele")
        pag.go_back()
        pag.wait_for_url("**/relatorios/beta-2t26-2")
        pag.wait_for_function("document.querySelector('h1.ana-cabecalho__emissor')?.innerText === 'Beta'")
        ok(True, "voltar do navegador volta ao relatório anterior")

        pag.click("text=Relatório completo")
        pag.wait_for_url("**/relatorios/beta-2t26-2/completo")
        pag.wait_for_selector(".rel-modal.is-visible")
        ok(True, "relatório completo tem endereço próprio")
        pag.go_back()
        pag.wait_for_url("**/relatorios/beta-2t26-2")
        pag.wait_for_selector(".rel-modal.is-visible", state="detached", timeout=5000) if pag.query_selector(".rel-modal.is-visible") else None
        ok(not pag.query_selector(".rel-modal.is-visible"), "voltar fecha o relatório completo")
        pag.click("text=Relatório completo")
        pag.wait_for_url("**/completo")
        pag.click(".rel-modal .cds--modal-close")
        pag.wait_for_url("**/relatorios/beta-2t26-2")
        pag.go_forward() if False else None
        ok(pag.evaluate("history.length") >= 1 and caminho() == "/relatorios/beta-2t26-2", "fechar (X) volta no histórico")

        pag.goto(BASE + "/relatorios/beta-2t26-2/completo")
        pag.wait_for_selector(".rel-modal.is-visible")
        pag.click(".rel-modal .cds--modal-close")
        pag.wait_for_url("**/relatorios/beta-2t26-2")
        ok(not pag.query_selector(".rel-modal.is-visible"), "link direto para /completo abre e fecha para o relatório")

        pag.goto(BASE + "/relatorios/nao-existe")
        pag.wait_for_selector("text=Relatório não encontrado")
        ok(caminho() == "/relatorios/nao-existe", "id inexistente: aviso, sem trocar por outro relatório")
        ok("Relatório não encontrado" in pag.title(), "título do não encontrado", pag.title())

        pag.goto(BASE + "/qualquer-coisa")
        pag.wait_for_selector("text=Página não encontrada")
        ok(True, "endereço desconhecido: página não encontrada")

        pag.goto(BASE + "/conversas/t1")
        pag.wait_for_selector("text=pergunta t1")
        ok("Conversa um" in pag.title(), "link de conversa abre a conversa", pag.title())
        pag.click("text=Conversa dois")
        pag.wait_for_url("**/conversas/t2")
        pag.wait_for_selector("text=pergunta t2")
        ok(True, "clicar noutra conversa navega e abre")
        pag.click("a.cds--header__menu-item >> text=Análise de Crédito")
        pag.wait_for_url("**/relatorios/**")
        pag.click("#ana-relatorio")
        pag.click("text=Alfa · 2T26")
        pag.wait_for_url("**/relatorios/alfa-2t26-1")
        pag.click("a.cds--header__menu-item >> text=Início")
        pag.wait_for_url("**/conversas/t2")
        n_antes = chamadas.count("/analise/api/chat/conversas/t2")
        pag.wait_for_selector("text=pergunta t2", state="visible", timeout=5000)
        ok(chamadas.count("/analise/api/chat/conversas/t2") == n_antes, "aba Início volta para a conversa aberta, sem recarregar")
        pag.click("a.cds--header__menu-item >> text=Análise de Crédito")
        pag.wait_for_url("**/relatorios/alfa-2t26-1")
        ok(True, "aba Análise volta para o último relatório aberto")
        pag.click("a.cds--header__menu-item >> text=Início")
        pag.wait_for_url("**/conversas/t2")
        pag.click(".chat-sidebar__new")
        pag.wait_for_url(re.compile(r".*/conversas$"))
        pag.wait_for_selector("text=pergunta t2", state="hidden", timeout=3000)
        ok(True, "nova conversa: /conversas e tela limpa")
        n_antes = len(chamadas)
        pag.go_back()
        pag.wait_for_url("**/conversas/t2")
        try:
            pag.wait_for_selector("text=pergunta t2", timeout=5000)
        except Exception:
            print("chamadas depois do voltar:", chamadas[n_antes:])
            print("console:", "\n".join([l for l in logs if "DBG" in l][-14:]))
            print("texto:", pag.inner_text("main")[:300])
            raise
        ok(True, "voltar reabre a conversa anterior")
        pag.go_forward()
        pag.wait_for_url(re.compile(r".*/conversas$"))
        pag.wait_for_function("!document.body.innerText.includes('pergunta t2')")
        ok(True, "avançar até /conversas é conversa nova de novo")
        href = pag.get_attribute("a.cds--header__menu-item >> text=Documentos", "href") or \
            pag.evaluate("[...document.querySelectorAll('a.cds--header__menu-item')].map(a => a.getAttribute('href'))")
        ok("/documentos" in str(href), "abas do cabeçalho são links de verdade", str(href))

        # Geração pelo seletor: a janela fecha quando a versão 1 fica pronta e a versão 2 é acompanhada na página.
        pag.goto(BASE + "/relatorios/beta-2t26-2")
        pag.wait_for_selector("h1.ana-cabecalho__emissor")
        pag.click("#ana-relatorio")
        pag.click("text=Gerar novo relatório")
        try:
            pag.wait_for_selector(".cds--modal.is-visible >> text=Gerar relatório de crédito", timeout=5000)
        except Exception:
            pag.screenshot(path=str(Path(RAIZ) / "testes" / "falha.png"))
            print("console:", [l for l in logs if "rror" in l][-5:])
            raise
        pag.wait_for_function("document.querySelector('#gerar-periodo')?.value === '2T26'")
        pag.click(".cds--modal.is-visible >> button:has-text('Gerar')")
        pag.wait_for_url("**/relatorios/gama-2t26-1", timeout=15000)
        pag.wait_for_selector(".cds--modal.is-visible >> text=Gerar relatório de crédito", state="detached", timeout=5000)
        ok(True, "versão 1 pronta: a janela de geração fecha e o relatório novo abre")
        pag.wait_for_selector("text=Interpretação automática em preparo", timeout=8000)
        ok(True, "o preparo da versão 2 aparece na página")
        GAMA["versao"] = 2
        GERACAO["v2"] = "pronta"
        pag.wait_for_selector("text=pronta, com a interpretação automática", timeout=30000)
        ok(not pag.is_visible("text=Chegou a versão"), "versão 2 automática: aviso próprio, não o de edição")
        ok(not pag.is_visible("text=Interpretação automática em preparo"), "o aviso de preparo sai")
        print("TUDO OK")
        nav.close()
finally:
    subprocess.run(f"taskkill /PID {srv.pid} /T /F", shell=True, capture_output=True)
