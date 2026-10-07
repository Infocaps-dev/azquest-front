import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  Tag,
} from '@carbon/react'
import { Checkmark, Home, Logout } from '@carbon/icons-react'

function AppHeader() {
  return (
    <Header aria-label="AZ Quest" className="chat-header">
      <HeaderName href="#" prefix="">
        AZ Quest
      </HeaderName>
      <HeaderNavigation aria-label="Navegação">
        <HeaderMenuItem href="#">
          <span className="chat-header__nav-item">
            <Home size={16} /> Início
          </span>
        </HeaderMenuItem>
      </HeaderNavigation>
      <HeaderGlobalBar>
        <div className="chat-header__status">
          <Tag type="red" size="sm" renderIcon={Checkmark}>
            Atualizado
          </Tag>
          <span className="chat-header__user">vmiguel@ctiglobal.com</span>
        </div>
        <HeaderGlobalAction aria-label="Sair" tooltipAlignment="end">
          <Logout size={20} />
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  )
}

export default AppHeader
