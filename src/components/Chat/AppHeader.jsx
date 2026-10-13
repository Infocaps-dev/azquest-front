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
import logo from '../../assets/azquest-logo.png'

function AppHeader() {
  return (
    <Header aria-label="AZ Quest" className="chat-header">
      <HeaderName href="#" prefix="">
        <img src={logo} alt="AZ Quest" style={{ height: '2.5rem', display: 'block' }} />
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
          <Tag type="blue" size="sm" renderIcon={Checkmark}>
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
