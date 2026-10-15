import ChatMain from './ChatMain.jsx'
import ContextPanel from './ContextPanel.jsx'
import ConversationSidebar from './ConversationSidebar.jsx'
import './ChatPage.scss'

function ChatPage() {
  return (
    <div className="chat-layout">
      <ConversationSidebar />
      <ChatMain />
      <ContextPanel />
    </div>
  )
}

export default ChatPage
