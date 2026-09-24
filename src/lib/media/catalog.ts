export type Emoji = { value: string; name: string; category: string; tone?: boolean };
const groups: Record<string, string> = {
  Faces: '😀|grinning happy;😃|smile joy;😄|laugh smile;😁|beaming;😅|sweat smile;😂|tears laughter;🤣|rolling laugh;😊|blush happy;😇|angel;🙂|slight smile;🙃|upside down;😉|wink;😍|heart eyes love;🥰|love hearts;😘|kiss;😋|delicious;😎|cool sunglasses;🤩|star struck;🥳|party celebration;🤔|thinking;🤨|raised eyebrow;😐|neutral;😏|smirk;😒|unamused;😔|sad;😢|cry;😭|sob;😮|surprised;😱|scream;😴|sleep;🤯|mind blown;🥺|pleading',
  Gestures: '👍|thumbs up yes;👎|thumbs down no;👏|clap applause;🙌|raised hands celebrate;👋|wave hello;🤝|handshake;🙏|thanks pray;✌️|peace victory;👌|okay;💪|strong muscle;🤞|fingers crossed;🫶|heart hands',
  Hearts: '❤️|red heart love;🧡|orange heart;💛|yellow heart;💚|green heart;💙|blue heart;💜|purple heart;🖤|black heart;🤍|white heart;💕|two hearts;💔|broken heart;💯|hundred perfect;✨|sparkles',
  Nature: '🌞|sun;🌙|moon;⭐|star;🌈|rainbow;🌧️|rain;❄️|snow;🔥|fire;🌸|blossom;🌻|sunflower;🌱|seedling;🌳|tree;🍀|luck clover;🐶|dog;🐱|cat;🦊|fox;🐼|panda;🦋|butterfly',
  Food: '☕|coffee;🍵|tea;🍕|pizza;🍔|burger;🍟|fries;🍜|noodles;🍣|sushi;🍰|cake;🍎|apple;🍓|strawberry;🥑|avocado;🍿|popcorn',
  Activities: '🎉|party popper;🎊|confetti;🎂|birthday;🎁|gift;🎈|balloon;🏆|trophy;🥇|medal;⚽|soccer football;🏀|basketball;🎮|game;🎨|art;🎵|music',
  Objects: '🚀|rocket;💡|idea bulb;⚡|lightning fast;✅|check done;❌|cross no;❓|question;💬|chat;📎|attachment;📚|books;💻|computer;📅|calendar;⏰|alarm;📌|pin;🔒|lock;🌍|world;🏠|home',
};
export const EMOJIS: Emoji[] = Object.entries(groups).flatMap(([category, value]) => value.split(';').map(item => {
  const [emoji, name] = item.split('|'); return { value: emoji, name, category, tone: category === 'Gestures' && emoji !== '🤝' };
}));
export const EMOJI_CATEGORIES = Object.keys(groups);
export const SKIN_TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
export const withTone = (emoji: Emoji, tone: string) => emoji.tone && tone ? emoji.value.replace('\uFE0F', '') + tone : emoji.value;
export const DEFAULT_EMOJIS = ['😀', '❤️', '😂', '👍', '😭', '🔥', '🎉', '🙏'];

export const STICKER_PACKS = [{ id: 'orb', name: 'Little Orbs', version: 1, thumbnail: '/stickers/orb-v1-happy.svg' }];
export const STICKERS = [
  ['happy', 'Hello sunshine', 'hello happy smile'], ['love', 'Big love', 'heart love thanks'],
  ['laugh', 'Too funny', 'laugh funny joy'], ['thanks', 'Thank you', 'thanks gratitude'],
  ['wow', 'Oh wow', 'wow surprised amazing'], ['sad', 'Rainy day', 'sad cry sorry'],
  ['yes', 'You got this', 'yes okay good luck'], ['party', 'Time to celebrate', 'party celebrate birthday'],
].map(([id, name, keywords]) => ({ id: `orb-v1-${id}`, packId: 'orb', version: 1, name, keywords, asset: `/stickers/orb-v1-${id}.svg`, width: 160, height: 160 }));
