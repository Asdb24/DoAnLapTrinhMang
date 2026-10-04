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
            console.log(`[${this.name}] Nhận MSG_ACK (Server xác nhận tin nhắn): clientMsgId = ${packet.clientMsgId}`);
            this.receivedAcks.push(packet);
          } else if (packet.type === 'NEW_MSG') {
            console.log(`[${this.name}] NHẬN ĐƯỢC TIN NHẮN TỪ [${packet.msg.senderName}]: "${packet.msg.content}"`);
            this.receivedMessages.push(packet.msg);
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

  // 6. Kiểm tra kết quả
  console.log('\n--- BƯỚC 5: TỔNG KẾT KẾT QUẢ KIỂM THỬ ---');
  const bobReceivedAlice = bob.receivedMessages.some((m) => m.content.includes('Chào Bob!'));
  const aliceReceivedBob = alice.receivedMessages.some((m) => m.content.includes('Chào Alice!'));
  const bobReceivedTyping = bob.receivedTyping.length > 0;

  console.log(`- Bob nhận được tin nhắn từ Alice: ${bobReceivedAlice ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);
  console.log(`- Alice nhận được tin nhắn phản hồi từ Bob: ${aliceReceivedBob ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);
  console.log(`- Bob nhìn thấy hiệu ứng Alice đang gõ (Typing): ${bobReceivedTyping ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'}`);

  alice.close();
  bob.close();

  if (bobReceivedAlice && aliceReceivedBob && bobReceivedTyping) {
    console.log('\n🎉 KẾT QUẢ: 2 NGƯỜI CHAT QUA LẠI HOÀN TOÀN THÀNH CÔNG 100% QUA CLOUD VPS!');
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
