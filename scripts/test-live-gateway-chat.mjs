// Script kiểm thử giao tiếp thời gian thực 2 chiều giữa 2 người dùng qua Cloud VPS Gateway (WSS)
const GATEWAY_URL = 'wss://168-138-160-93.sslip.io';

console.log(`[TEST] Đang kết nối tới Gateway máy chủ Oracle Cloud: ${GATEWAY_URL}`);

class TestUser {
  constructor(name, userId) {
    this.name = name;
    this.userId = userId;
    this.ws = new WebSocket(GATEWAY_URL);
    this.receivedMessages = [];
    this.receivedAcks = [];
    this.receivedTyping = [];
    this.receivedEdits = [];
    this.receivedDeletes = [];
  }

  async waitForOpen() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        console.log(`[${this.name}] Đã kết nối WSS thành công tới VPS!`);
        resolve();
      };
      this.ws.onerror = (err) => reject(new Error(`[${this.name}] Lỗi kết nối: ${err.message || 'Error'}`));
      this.ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'WELCOME') {
            console.log(`[${this.name}] Nhận gói WELCOME từ Gateway. Session: ${packet.sessionId}`);
          } else if (packet.type === 'MSG_ACK') {
            console.log(`[${this.name}] Nhận MSG_ACK (Server xác nhận tin nhắn): clientMsgId = ${packet.clientMsgId}, serverMsgId = ${packet.serverMsgId}`);
            this.receivedAcks.push(packet);
          } else if (packet.type === 'NEW_MSG') {
            console.log(`[${this.name}] NHẬN ĐƯỢC TIN NHẮN TỪ [${packet.msg.senderName}]: "${packet.msg.content}" (ID: ${packet.msg.id})`);
            this.receivedMessages.push(packet.msg);
          } else if (packet.type === 'MSG_EDITED') {
            console.log(`[${this.name}] NHẬN ĐƯỢC CẬP NHẬT SỬA TIN NHẮN: ID=${packet.messageId}, Nội dung mới: "${packet.newContent}"`);
            this.receivedEdits.push(packet);
          } else if (packet.type === 'MSG_DELETED') {
            console.log(`[${this.name}] NHẬN ĐƯỢC THÔNG BÁO XÓA/THU HỒI TIN NHẮN: ID=${packet.messageId}`);
            this.receivedDeletes.push(packet);
          } else if (packet.type === 'TYPING') {
            console.log(`[${this.name}] Thấy đối phương đang gõ chữ: userId = ${packet.userId}`);
            this.receivedTyping.push(packet);
          }
        } catch (e) {
          console.error(e);
        }
      };
    });
  }

  send(packet) {
    this.ws.send(JSON.stringify(packet));
  }

  close() {
    this.ws.close();
  }
}

async function runTest() {
  const alice = new TestUser('Alice', 'user_alice_01');
  const bob = new TestUser('Bob', 'user_bob_02');

  await Promise.all([alice.waitForOpen(), bob.waitForOpen()]);

  // 1. Handshake HELLO
  alice.send({ type: 'HELLO', userId: alice.userId, displayName: 'Alice' });
  bob.send({ type: 'HELLO', userId: bob.userId, displayName: 'Bob' });
  await new Promise((r) => setTimeout(r, 300));

  // 2. Cùng tham gia vào một phòng chat (Room: 'room_demo_999')
  const roomId = 'room_demo_999';
  console.log(`\n--- BƯỚC 1: Cả 2 cùng vào phòng chat: ${roomId} ---`);
  alice.send({ type: 'JOIN_ROOM', roomId });
  bob.send({ type: 'JOIN_ROOM', roomId });
  await new Promise((r) => setTimeout(r, 400));

  // 3. Alice gõ chữ (Typing)
  console.log(`\n--- BƯỚC 2: Alice bật thông báo đang soạn tin nhắn (Typing Indicator) ---`);
  alice.send({ type: 'TYPING', roomId, userId: alice.userId, isTyping: true });
  await new Promise((r) => setTimeout(r, 300));

  // 4. Alice gửi tin nhắn cho Bob
  console.log(`\n--- BƯỚC 3: Alice gửi tin nhắn cho Bob ---`);
  alice.send({
    type: 'SEND_MSG',
    clientMsgId: 'req_alice_001',
    roomId,
    content: 'Chào Bob! Bạn có nhận được tin nhắn này qua mạng thật không?',
  });
  await new Promise((r) => setTimeout(r, 600));

  // 5. Bob nhận được tin nhắn và gửi lại cho Alice
  console.log(`\n--- BƯỚC 4: Bob nhận được và phản hồi lại cho Alice ---`);
  bob.send({
    type: 'SEND_MSG',
    clientMsgId: 'req_bob_002',
    roomId,
    content: 'Chào Alice! Mình nhận được tin nhắn của bạn ngay lập tức rồi nhé!',
  });
  await new Promise((r) => setTimeout(r, 600));

  // 6. Alice chỉnh sửa tin nhắn đã gửi
  console.log(`\n--- BƯỚC 5: Alice chỉnh sửa tin nhắn đã gửi (Edit Message) ---`);
  const aliceMsgAck = alice.receivedAcks.find((a) => a.clientMsgId === 'req_alice_001');
  const targetMsgId = aliceMsgAck ? aliceMsgAck.serverMsgId : 'msg_alice_mock';
  alice.send({
    type: 'EDIT_MSG',
    roomId,
    messageId: targetMsgId,
    newContent: 'Chào Bob! (đã chỉnh sửa nội dung thành công)',
  });
  await new Promise((r) => setTimeout(r, 600));

  // 7. Alice xóa tin nhắn đã gửi (Delete/Revoke Message)
  console.log(`\n--- BƯỚC 6: Alice xóa / thu hồi tin nhắn đã gửi (Delete Message) ---`);
  alice.send({
    type: 'DELETE_MSG',
    roomId,
    messageId: targetMsgId,
  });
  await new Promise((r) => setTimeout(r, 600));

  // 8. Kiểm tra kết quả
  console.log('\n--- BƯỚC 7: TỔNG KẾT KẾT QUẢ KIỂM THỬ ---');
  const bobReceivedAlice = bob.receivedMessages.some((m) => m.content.includes('Chào Bob!'));
  const aliceReceivedBob = alice.receivedMessages.some((m) => m.content.includes('Chào Alice!'));
  const bobReceivedTyping = bob.receivedTyping.length > 0;
  const bobReceivedEdit = bob.receivedEdits.some((e) => e.messageId === targetMsgId);
  const bobReceivedDelete = bob.receivedDeletes.some((d) => d.messageId === targetMsgId);

  console.log(`- Bob nhận được tin nhắn từ Alice: ${bobReceivedAlice ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);
  console.log(`- Alice nhận được tin nhắn phản hồi từ Bob: ${aliceReceivedBob ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);
  console.log(`- Bob nhìn thấy hiệu ứng Alice đang gõ (Typing): ${bobReceivedTyping ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);
  console.log(`- Bob nhận được sự kiện Alice sửa tin nhắn (Edit): ${bobReceivedEdit ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);
  console.log(`- Bob nhận được sự kiện Alice xóa tin nhắn (Delete): ${bobReceivedDelete ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);

  alice.close();
  bob.close();

  if (bobReceivedAlice && aliceReceivedBob && bobReceivedTyping && bobReceivedEdit && bobReceivedDelete) {
    console.log('\n🎉 KẾT QUẢ: TOÀN BỘ CHAT, TYPING, EDIT VÀ DELETE ĐÃ THÀNH CÔNG 100% TRÊN MÁY CHỦ ORACLE CLOUD VPS!');
    process.exit(0);
  } else {
    console.log('\n❌ KẾT QUẢ: Có lỗi trong quá trình truyền nhận.');
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
