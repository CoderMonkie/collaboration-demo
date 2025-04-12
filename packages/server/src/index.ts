import { Server } from '@hocuspocus/server'
import { Doc } from 'yjs';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer'

// 用于跟踪活跃用户
const activeUsers = new Map()
// 模拟文档存储
const documentsStore = new Map([
  ['demo-document', {
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: '协作文档示例' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '这是一个示例文档，所有人都可以编辑这个内容。' }]
        }
      ]
    },
    // contnet: null,
    lastModified: new Date()
  }]
]);
// 跟踪文档初始化状态
const documentInitializationStatus = new Map();

type DocInitStatus = 'initializing' | 'initialized' | 'initializationFailed';

const server = Server.configure({
  port: process.env.PORT ? parseInt(process.env.PORT) : 1235,
  // address: '127.0.0.1',
  address: '0.0.0.0',
  async onConnect(data) {
    const userId = data.requestParameters.get('userId') || 'anonymous'
    const documentId = data.documentName
    
    console.log('新的连接请求:', {
      userId,
      documentId,
      time: new Date().toISOString()
    })

    // 记录活跃用户
    const userKey = `${documentId}:${userId}`
    activeUsers.set(userKey, {
      userId,
      documentId,
      lastActive: new Date()
    })

    return {
      user: {
        id: userId,
        documentId
      }
    }
  },
  
  onAwarenessUpdate: ({ states, context, documentName }) => {
    console.log('用户状态更新:', {
      documentName,
      activeUsers: states.length,
      states: states.map(state => state.user),
      // context,
    })
    
    // 检查是否有用户完成了文档初始化
    for (const [clientId, state] of states.entries()) {
      if (state.documentInitialized) {
        // 更新文档初始化状态
        documentInitializationStatus.set(documentName, 'initialized');
        console.log(`文档 ${documentName} 已由用户 ${state.user?.id || '未知用户'} 完成初始化`);
        break;
      }
    }
  
    return Promise.resolve()
  },

  onDisconnect: (data) => {
    const userId = data.context?.user?.id
    const documentId = data.documentName
    
    if (userId) {
      activeUsers.delete(`${documentId}:${userId}`)
      console.log(`用户离开: ${userId}, 文档: ${documentId}`)
    }
    return Promise.resolve()
  },

  onLoadDocument: ({ documentName, document }) => {
    // 获取或创建共享的XmlFragment，假设Tiptap使用名为'content'的片段
    // const content = document.getXmlFragment('content');
    // // 创建ProseMirror兼容的初始结构
    // const docNode = new Y.XmlElement('doc');
    // const paragraph = new Y.XmlElement('paragraph');
    // const textNode = new Y.XmlText('<h1>欢迎使用协作编辑器</h1><p>这是一个示例文档，所有人都可以编辑这个内容。</p>');
    // // 组装结构
    // paragraph.insert(0, [textNode]);
    // docNode.insert(0, [paragraph]);
    // content.insert(0, [docNode]);
    // return Promise.resolve(document);
    // 以上方案的问题是，无法回显html富文本，不可能将每个标签节点都实例化一遍
    
    if (document.isEmpty('content')) {
      // 检查文档是否已有缓存
      const content = documentsStore.get(documentName)?.content;
      if (content) {
        const ydoc = TiptapTransformer.toYdoc(content, 'content');
        document.merge(ydoc);
        console.log(`文档 ${documentName} 有缓存，使用服务端文档数据`);
      } else {
        // 检查文档是否正在被初始化
        const initStatus = documentInitializationStatus.get(documentName);
        const metadata = document.getMap('metadata');

        if (initStatus === 'initialized') {
          // 文档已经被初始化，但可能还没有同步到当前用户
          // 不需要做任何事情，等待数据同步
          console.log(`文档 ${documentName} 已被初始化，等待同步`);
        } else if (initStatus === 'initializing') {
          // 文档正在被其他用户初始化，标记为等待初始化完成
          metadata.set('needsInitialization', false);
          metadata.set('waitForInitialization', true);
          console.log(`文档 ${documentName} 正在被其他用户初始化，标记为等待`);
        } else {
          // 获取当前文档的活跃用户列表
          const docUsers = Array.from(activeUsers.entries())
          .filter(([key]) => key.startsWith(`${documentName}:`))
          .map(([_, userData]) => userData);
        
          // 如果有活跃用户，选择第一个作为初始化者
          if (docUsers.length > 0) {
            const initializer = docUsers[0];
            
            // 设置初始化标记
            metadata.set('needsInitialization', true);
            metadata.set('reason', 'documentNotFound');
            metadata.set('initializerId', initializer.userId);
            
            // 模拟从API获取的HTML内容
            const htmlContent = `<h1>从HTML初始化的文档</h1><p>这是一个从HTML内容初始化的文档示例。</p>`;
            metadata.set('htmlContent', htmlContent);
            
            // 更新初始化状态
            documentInitializationStatus.set(documentName, 'initializing');
            console.log(`文档 ${documentName} 不存在，已指定用户 ${initializer.userId} 为初始化者`);
          } else {
            // 没有活跃用户，这种情况不应该发生
            console.log(`文档 ${documentName} 没有活跃用户，无法指定初始化者`);
          }
        }
      }
    }

    return Promise.resolve(document);
  },
  onStoreDocument: ({ documentName, document }) => {
    console.log(`保存文档: ${documentName}：${JSON.stringify(document)}`);
    console.log('stored 文档内容:', documentsStore.get(documentName));

    try {
      // 将 Ydoc 转换为可存储的格式
      const prosemirrorJSON = TiptapTransformer.fromYdoc(document, 'content');
      console.log(`保存文档 ${documentName}:`, JSON.stringify(prosemirrorJSON));
      documentsStore.set(documentName, {
        content: prosemirrorJSON,
        lastModified: new Date()
      });
      
    } catch (error) {
      console.log('store save 转换失败:', error);
    }

    return Promise.resolve();
  }
})

const startServer = async () => {
  try {
    console.log('正在启动服务器...')
    await server.listen()
    console.log('服务器启动成功 - 监听地址: ws://127.0.0.1:1234')
  } catch (error) {
    console.error('服务器启动失败:', error)
    process.exit(1)
  }
}

// 添加未捕获异常的处理
process.on('uncaughtException', (error) => {
  console.error('服务器未捕获异常:', error)
})

process.on('unhandledRejection', (error) => {
  console.error('服务器未处理的Promise拒绝:', error)
})

startServer()
