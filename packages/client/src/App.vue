<script setup lang="ts">
import { Editor, useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc, applyUpdate } from 'yjs'
import { Awareness } from 'y-protocols/awareness';
import { onMounted, ref, shallowRef, onBeforeUnmount } from 'vue'

interface IUser {
  name: string;
  color: string;
  id: string;
}

// 生成随机用户信息
const generateRandomUser = (): IUser => {
  const names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十']
  const colors = [
    '#7986CB', // 靛蓝色
    '#81C784', // 绿色
    '#64B5F6', // 蓝色
    '#FFB74D', // 橙色
    '#BA68C8', // 紫色
    '#4DB6AC', // 青色
    '#F06292', // 粉色
    '#9575CD'  // 紫罗兰色
  ]
  
  return {
    name: names[Math.floor(Math.random() * names.length)],
    color: colors[Math.floor(Math.random() * colors.length)],
    id: Math.random().toString(36).substring(2, 10)
  }
}

interface IDocument {
  id: string;
  docName: string;
}
// 文档列表数据
const documents = ref<IDocument[]>([
  { id: 'demo-document', docName: '协作文档' },
  { id: 'doc2', docName: '会议记录' },
  { id: 'doc3', docName: '项目计划' },
  { id: 'doc4', docName: '技术方案' },
])

// 当前选中的文档
const currentDocument = ref(documents.value[0])

const currentUser = ref(generateRandomUser())
const isConnected = ref(false)
const ydoc = ref(new Doc())
const provider = ref<any>(null)

const activeUsers = ref<{name:string;color:string;}[]>([])
const awareness = ref<any>(null)

let editor = shallowRef<Editor|undefined>();

// 初始化awareness
const initAwareness = () => {
  awareness.value = new Awareness(ydoc.value)
  awareness.value.setLocalState({
    user: currentUser.value,
    color: currentUser.value.color,
    name: currentUser.value.name,
  })
  
  // 监听其他用户状态变化
  awareness.value.on('change', () => {
    const states = Array.from(awareness.value.getStates().values()) as {user:IUser,name:string,color:string}[]
    activeUsers.value = states
      .filter(state => state.user?.id !== currentUser.value.id)
      .map(state => ({
        name: state.name,
        color: state.color
      }))
  })
}

const initEditor = () => {
  // 断开之前的连接
  if (provider.value) {
    provider.value.destroy()
  }

  // 初始化awareness
  initAwareness()

  const editorOptins = {
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: ydoc.value,
        field: 'content',
      })
    ],
    editable: true,
    content: '',
    // @ts-ignore
    onTransaction: ({ transaction }) => {
      if (transaction.getMeta('networkError')) {
        console.error('WebSocket连接失败，请检查协同服务器状态')
        isConnected.value = false
      }
    },
    onCreate: () => {
      console.log('editor onCreate')
    },
    onUpdate: () => {
      console.log('editor onUpdate: 内容更新')
    }
  }

  // 创建编辑器实例
  editor.value = new Editor(editorOptins)
}

// 切换文档
const switchDocument = (document:IDocument) => {
  console.log('切换到文档:', document)
  
  // 先断开当前连接
  if (provider.value) {
    provider.value.destroy()
    provider.value = null
  }
  
  // 销毁旧的编辑器实例
  if (editor.value) {
    editor.value.destroy();
    editor.value = undefined;
  }
  
  // 更新当前文档
  currentDocument.value = document
  
  // 重置文档和状态
  ydoc.value = new Doc()
  activeUsers.value = []
  isConnected.value = false
  
  // 确保content字段存在
  ydoc.value.getXmlFragment('content')
  
  // 初始化编辑器
  initEditor()
  
  // 连接到协作服务器
  setTimeout(() => {
    connectToDocument(document)
  }, 100)
}

// 连接到协作服务器
const connectToDocument = (document: IDocument) => {
  console.log('连接到文档:', document.id)
  
  // 创建新的provider连接
  provider.value = new HocuspocusProvider({
    url: 'ws://localhost:1235',
    name: document.id, // 使用文档ID作为连接名称
    document: ydoc.value,
    awareness: awareness.value,
    parameters: {
      userId: currentUser.value.id,
      docName: document.docName // 传递文档名称
    },
    token: 'test-token', // 添加测试token
    onConnect: () => {
      console.log('客户端: 连接成功')
      isConnected.value = true
    },
    onSynced: ({state}) => {
      console.log('客户端: 文档同步完成', state)
      
      // 确保 content 字段存在
      if (!ydoc.value.share.has('content')) {
        ydoc.value.getXmlFragment('content')
      }
      
      const content = ydoc.value.getXmlFragment('content')
      console.log('当前文档内容:', content.toJSON())

      // 检查是否需要初始化
      const metadata = ydoc.value.getMap('metadata')
      const needsInitialization = metadata.get('needsInitialization')

      if (needsInitialization) {
        console.log('服务端标记文档需要初始化，原因:', metadata.get('reason'))

        // editor.value?.commands.setContent({
        //   type: 'doc',
        //   content: [
        //     {
        //       type: 'heading',
        //       attrs: { level: 1 },
        //       content: [{ type: 'text', text: '新文档' }]
        //     },
        //     {
        //       type: 'paragraph',
        //       content: [{ type: 'text', text: '这是一个新创建的文档。' }]
        //     }
        //   ]
        // })
        const initializerId = metadata.get('initializerId');
        if (initializerId === currentUser.value.id) {
          // 当前用户被指定为初始化者
          const htmlContent = metadata.get('htmlContent');
          if (htmlContent) {
            // 使用HTML内容初始化编辑器
            editor.value?.commands.setContent(htmlContent, true);
            console.log('作为指定初始化者初始化文档');
            
            // 通知服务器初始化完成
            provider.value.awareness.setLocalStateField('documentInitialized', true);
        
            metadata.delete('needsInitialization')
            metadata.delete('htmlContent')
            metadata.delete('reason')
          }
        } else {
          console.log('等待指定用户初始化文档');
        }
        // setTimeout(() => {
        // }, 100)
      } else if (metadata.get('waitForInitialization')) {
        console.log('等待文档初始化完成');
        // 不执行setContent，等待数据同步
        metadata.delete('waitForInitialization')
      }
    },
    onMessage: ({message}) => {
      // console.log('客户端: 收到消息', message.data)
    },
    onDisconnect: (args) => {
      console.log('客户端: 连接断开，原因:', args)
      isConnected.value = false
    },
    onClose: () => {
      console.log('客户端: WebSocket关闭')
    },
  })
}

// 修改初始化逻辑
onMounted(() => {
  // 确保按正确顺序初始化
  ydoc.value = new Doc()
  
  // 确保content字段存在
  ydoc.value.getXmlFragment('content')

  // 初始化awareness
  initAwareness()

  // 初始化编辑器
  initEditor()

  // 连接到文档
  connectToDocument(currentDocument.value)
})

onBeforeUnmount(() => {
  // 清理资源
  if (provider.value) {
    provider.value.destroy()
  }
  
  if (editor.value) {
    editor.value.destroy()
  }
})

</script>

<template>
  <div class="app-container">
    <div class="user-info">
      <!-- 现有用户信息 -->
      <div class="user-avatar" :style="{ backgroundColor: currentUser.color }">
        {{ currentUser.name.charAt(0) }}
      </div>
      <div class="current-user">
        <label>当前用户：</label>
        <span class="user-name">{{ currentUser.name }}</span>
      </div>
      
      <!-- 其他在线用户 -->
      <div class="other-users" v-if="activeUsers.length > 0">
        <label>其他正在编辑该文档用户：</label>
        <span class="other-user" 
              v-for="user in activeUsers" 
              :key="user.name"
              :style="{ backgroundColor: user.color }">
          {{ user.name.charAt(0) }}
        </span>
      </div>
      
      <div class="connection-status" :class="{ connected: isConnected }">
        {{ isConnected ? '已连接' : '未连接' }}
      </div>
    </div>
    
    <div class="main-content">
      <!-- 左侧文档列表 -->
      <div class="document-list">
        <h3>我的文档</h3>
        <ul>
          <li 
            v-for="doc in documents" 
            :key="doc.id"
            :class="{ active: currentDocument.id === doc.id }"
            @click="switchDocument(doc)">
            {{ doc.docName }}
          </li>
        </ul>
      </div>
      
      <!-- 右侧编辑器 -->
      <div class="editor-wrapper">
        <h2 class="document-title">{{ currentDocument.docName }}</h2>
        <div class="editor-container">
          <editor-content :editor="editor" />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.app-container {
  width: 1200px;
  margin: 2rem auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.main-content {
  display: flex;
  gap: 1.5rem;
}

.document-list {
  width: 240px;
  background-color: #ffffff;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid #eaeaea;
}

.document-list h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #1a1a1a;
  font-size: 1.1rem;
  font-weight: 600;
  padding-left: 0.5rem;
  border-left: 3px solid #1890ff;
}

.document-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.document-list li {
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  color: #595959;
}

.document-list li::before {
  content: "📄";
  margin-right: 0.5rem;
  font-size: 1.1em;
}

.document-list li:hover {
  background-color: #f0f7ff;
  color: #1890ff;
  transform: translateX(4px);
}

.document-list li.active {
  background-color: #e6f7ff;
  color: #1890ff;
  font-weight: 500;
  border-right: 3px solid #1890ff;
}

.editor-wrapper {
  flex: 1;
}

.document-title {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #333;
  font-size: 1.5rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
}

.current-user label {
  color: #777;
}
.user-name {
  font-weight: bold;
}

.connection-status {
  margin-left: auto;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background-color: #ff4d4f;
  color: white;
}

.connection-status.connected {
  background-color: #52c41a;
}

.editor-container {
  padding: 1rem;
  border: 1px solid #eee;
  border-radius: 8px;
  min-height: 500px;
}

/* TipTap编辑器样式 */
.ProseMirror {
  outline: none;
  min-height: 400px;
}

.ProseMirror p {
  margin: 1em 0;
}

.other-users {
  display: flex;
  gap: 0.5rem;
  margin-left: 1rem;
  color: #777;
}

.other-user {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.8em;
}
</style>
