// import express from 'express';
// import expressWebsockets from "express-ws";
// import path from 'path';
//
import { Server } from '@hocuspocus/server'
import { TiptapTransformer } from '@hocuspocus/transformer'

/** express 构建静态托管服务，用于前后端同服部署 */
const express = require('express');
const expressWebsockets = require('express-ws');
const path = require('path');

const { app } = expressWebsockets(express());
const staticDir = process.env.STATIC_DIR || path.resolve(__dirname, '../../client/dist');
console.log('express static dir', __dirname + '\n', staticDir);
app.use(express.static(staticDir));

// 兼容 SPA 路由，所有未知路由都返回 index.html
app.get('*', (req: { path: string; headers: any; }, res: { sendFile: (arg0: string) => void; }, next: () => any) => {
  if (req.path.startsWith('/api') || (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket')) {
    return next();
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});
/** express 构建静态托管服务，用于前后端同服部署 */

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

// 每个文档的最大编辑人数
const MAX_USERS_PER_DOCUMENT = 6;

// 预设颜色列表（不包含浅灰色）
const COLORS = [
  '#7986CB', // 靛蓝色
  '#81C784', // 绿色
  '#64B5F6', // 蓝色
  '#FFB74D', // 橙色
  '#BA68C8', // 紫色
  '#4DB6AC', // 青色
  '#F06292', // 粉色
  '#9575CD', // 紫罗兰色
  '#FF8A65', // 深橙色
  '#4FC3F7'  // 浅蓝色
];

// 跟踪每个文档的颜色分配情况
const documentColors = new Map();

// 获取文档可用颜色
function getAvailableColor(documentId: string) {
  // 如果文档没有颜色分配记录，初始化一个
  if (!documentColors.has(documentId)) {
    documentColors.set(documentId, new Map());
  }

  const docColorMap = documentColors.get(documentId);

  // 找到一个未被使用的颜色
  for (const color of COLORS) {
    let isUsed = false;
    for (const [_, assignedColor] of docColorMap.entries()) {
      if (assignedColor === color) {
        isUsed = true;
        break;
      }
    }

    if (!isUsed) {
      return color;
    }
  }

  // 如果所有颜色都被使用了，返回第一个颜色（理论上不会发生，因为我们限制了用户数量）
  return COLORS[0];
}

type DocInitStatus = 'initializing' | 'initialized' | 'initializationFailed';

const server = Server.configure({
  // port: process.env.PORT ? parseInt(process.env.PORT) : 1235,
  // address: '127.0.0.1',
  // address: '0.0.0.0',
  async onConnect(data) {
    const userId = data.requestParameters.get('userId') || 'anonymous'
    const documentId = data.documentName

    console.log('新的连接请求:', {
      userId,
      documentId,
      time: new Date().toISOString()
    })

    // 清理可能存在的同一用户的旧连接记录
    const userKey = `${documentId}:${userId}`
    if (activeUsers.has(userKey)) {
      console.log(`用户 ${userId} 已有连接记录，清理旧记录`);
      activeUsers.delete(userKey);
      // 如果有颜色记录，也清理掉
      if (documentColors.has(documentId)) {
        documentColors.get(documentId).delete(userId);
      }
    }

    // 检查文档当前活跃用户数量
    // const docUsers = Array.from(activeUsers.entries())
    //   .filter(([key]) => key.startsWith(`${documentId}:`))
    //   .map(([_, userData]) => userData);

    // 如果超过最大用户数，拒绝连接
    // if (docUsers.length >= MAX_USERS_PER_DOCUMENT) {
    //   console.log(`文档 ${documentId} 已达到最大编辑人数 ${MAX_USERS_PER_DOCUMENT}，拒绝连接`);
    //   const err = new Error(JSON.stringify({
    //     type: 'error',
    //     code: 'MAX_USERS_EXCEEDED',
    //     message: '文档已达到最大编辑人数限制'
    //   }));
    //   throw err;
    // }

    // 为用户分配颜色
    const userColor = getAvailableColor(documentId);

    // 如果文档没有颜色分配记录，初始化一个
    if (!documentColors.has(documentId)) {
      documentColors.set(documentId, new Map());
    }

    // 记录用户颜色
    documentColors.get(documentId).set(userId, userColor);

    // 记录活跃用户
    // const userKey = `${documentId}:${userId}`
    activeUsers.set(userKey, {
      userId,
      documentId,
      color: userColor,
      lastActive: new Date()
    })

    // TODO 更新到 awareness

    // 客户端并无入参，无法返回数据
    // return {
    //   user: {
    //     id: userId,
    //     documentId,
    //     color: userColor
    //   }
    // }
  },
  connected: ({ documentName, connection, connectionInstance }) => {
    // 检查当前文档的活跃用户数量
    const docUsers = Array.from(activeUsers.entries())
      .filter(([key]) => key.startsWith(`${documentName}:`))
      .map(([_, userData]) => userData);

    if (docUsers.length > MAX_USERS_PER_DOCUMENT) {
      connectionInstance.readOnly = true;
      // 超出最大人数，主动通知客户端并断开连接
      connectionInstance.sendStateless(JSON.stringify({
        type: 'error',
        code: 'MAX_USERS_EXCEEDED',
        message: `无法进入编辑，文档已达到最大编辑人数限制${MAX_USERS_PER_DOCUMENT}人`
      }));
      console.log(`文档 ${documentName} 已超出最大编辑人数，已通知并断开连接`);
    } else {
      connectionInstance.readOnly = false;
      connectionInstance.sendStateless(JSON.stringify({
        type: 'info',
        code: 'CAN_EDIT',
        message: '你现在可以编辑文档'
      }));
      console.log('新的连接:', {
        documentName,
        connection,
        time: new Date().toISOString()
      });
    }
    return Promise.resolve();
  },

  onAuthenticate: ({ context, token, documentName, requestParameters }) => {
    console.log('认证请求:', {
      token,
      context,
      documentName,
      time: new Date().toISOString()
    })

    context.user = {
      id: requestParameters.get('userId'),
    }

    // 客户端并无入参，无法返回数据
    return Promise.resolve();
  },

  onAwarenessUpdate: ({ states, context, documentName, awareness }) => {
    console.log('用户状态更新:', {
      documentName,
      count: states.length,
      states,
      // context,
      activeUsers: activeUsers
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

  // 处理无状态消息
  onStateless: ({ documentName, connection, payload }) => {
    try {
      const data = JSON.parse(payload);

      // 处理请求用户颜色的消息
      if (data.type === 'requestUserColor' && data.userId) {
        const userId = data.userId;
        const userKey = `${documentName}:${userId}`;

        console.log(`${userId} 请求颜色，连接状态readOnly:${connection.readOnly}`)

        if (connection.readOnly) {
          return Promise.resolve();
        }

        // 如果用户在活跃用户列表中，并且有分配的颜色
        if (activeUsers.has(userKey)) {
          const userData = activeUsers.get(userKey);

          // 发送颜色信息回客户端
          connection.sendStateless(JSON.stringify({
            type: 'userColor',
            userId: userId,
            color: userData.color
          }));

          console.log(`发送用户 ${userId} 的颜色 ${userData.color} 到客户端`);
        }
      }
    } catch (error) {
      console.error('处理无状态消息时出错:', error);
    }

    return Promise.resolve();
  },

  onDisconnect: (data) => {
    // const userId = data.context?.user?.id
    const userId = data.requestParameters.get('userId')
    const documentId = data.documentName

    console.log('断开连接:', {
      data,
      userId,
      documentId,
      time: new Date().toISOString()
    })
    if (userId) {
      // 释放用户的颜色
      if (documentColors.has(documentId)) {
        documentColors.get(documentId).delete(userId);
      }

      activeUsers.delete(`${documentId}:${userId}`)
      console.log(`用户离开: ${userId}, 文档: ${documentId}`)
    }

    const document = data.instance.documents.get(data.documentName);
    if (document && document.connections) {
      // 统计当前可编辑用户数量
      const editableConnections = Array.from(document.connections.values()).filter(conn => conn.connection.readOnly === false);
      const readOnlyConnections = Array.from(document.connections.values()).filter(conn => conn.connection.readOnly === true);
      const canPromoteCount = MAX_USERS_PER_DOCUMENT - editableConnections.length;
      if (canPromoteCount > 0 && readOnlyConnections.length > 0) {
        // 只通知前 canPromoteCount 个只读用户
        for (let i = 0; i < canPromoteCount && i < readOnlyConnections.length; i++) {
          const conn = readOnlyConnections[i].connection;
          conn.readOnly = false;
          conn.sendStateless(JSON.stringify({
            type: 'info',
            code: 'CAN_EDIT',
            message: '现在可以编辑文档'
          }));
        }
      }
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

app.ws("/", (websocket: any, request: any) => {
  server.handleConnection(websocket, request);
});

const startServer = async () => {
  try {
    console.log('正在启动服务器...')
    // await server.listen()
    app.listen(process.env.PORT ? parseInt(process.env.PORT) : 1235, '0.0.0.0', () => {
      console.log(`服务器启动成功 - 监听地址: http://localhost:${process.env.PORT || 1235}`);
    });
    console.log('服务器启动成功')
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
