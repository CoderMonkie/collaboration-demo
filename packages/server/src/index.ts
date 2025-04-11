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
    // const doc = documentsStore.get(documentName);
    // const content = doc ? doc.content : null;
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
      const content = documentsStore.get(documentName)?.content;
      if (content) {
        const ydoc = TiptapTransformer.toYdoc(content, 'content');
        document.merge(ydoc);
        console.log(`文档 ${documentName} 有缓存，使用服务端文档数据`);
      } else {
        // 添加一个标记字段，表示需要前端初始化
        const metadata = document.getMap('metadata');
        metadata.set('needsInitialization', true);
        metadata.set('reason', 'documentNotFound');
        console.log(`文档 ${documentName} 不存在，已添加初始化标记`);
      }
    }

    return Promise.resolve(document);
  },
  onStoreDocument: ({ documentName, document }) => {
    console.log(`保存文档: ${documentName}：${JSON.stringify(document)}`);
    console.log('&& 文档内容:', documentsStore.get(documentName));

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
