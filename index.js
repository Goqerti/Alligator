require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const token = process.env.TOKEN;

const categories = ['Logo', 'Resim', 'Bayrak'];
const photoPaths = {
  Logo: './logo_fotolar',
  Resim: './resim_fotolar',
  Bayrak: './bayrak_fotolar',
};

const game = {
  active: false,
  category: '',
  photos: [],
  currentPhoto: null,
  round: 1,
  scores: {},
  timer: null,
};

let rating = {};
const dbFile = './db.json';

function readDb() {
  try {
    const data = fs.readFileSync(dbFile);
    return JSON.parse(data);
  } catch (err) {
    console.error(err);
    return {};
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(data));
  } catch (err) {
    console.error(err);
  }
}

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/game/, (msg) => {
  const chatId = msg.chat.id;
  if (msg.chat.type === 'private') {
    bot.sendMessage(chatId, 'Özel sohbetlerde /game komutu çalışmamaktadır.');
    return;
  }
  if (game.active) {
    bot.sendMessage(chatId, 'Bir oyun zaten devam ediyor! Lütfen mevcut oyunu bitirin.');
    return;
  }
  game.round = 1;
  startGame(chatId);
});

function startGame(chatId) {
  bot.sendMessage(chatId, 'Hangi kategoride oyun başlatmak istersiniz?', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Logo', callback_data: 'Logo' },
          { text: 'Resim', callback_data: 'Resim' },
          { text: 'Bayrak', callback_data: 'Bayrak' },
        ],
      ],
    },
  }).then((sentMessage) => {
    setTimeout(() => {
      bot.deleteMessage(chatId, sentMessage.message_id.toString());
    }, 6000);
  });
}

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const category = query.data;
  if (categories.includes(category)) {
    game.category = category;
    game.active = true;
    game.photos = getPhotos(category);
    sendNextPhoto(chatId);
  }
});

function sendNextPhoto(chatId) {
  if (game.photos.length === 0) {
    if (Object.keys(game.scores).length > 0) {
      endGame(chatId);
    } else {
      bot.sendMessage(chatId, 'Oyun bitti, hiç puan alınamadı!');
    }
    return;
  }
  const photoIndex = Math.floor(Math.random() * game.photos.length);
  game.currentPhoto = game.photos[photoIndex];
  game.photos.splice(photoIndex, 1);
  const photoPath = `${photoPaths[game.category]}/${game.currentPhoto}`;
  const photoName = game.currentPhoto.split('.')[0];
  const wordCount = photoName.split(' ').length;
  let categoryText = '';
  let answerText = '';
  switch (game.category) {
    case 'Logo':
      categoryText = '🔖 Kategori: Logo';
      answerText = '🧩 Logolara uygun cevabı bul chate yaz';
      break;
    case 'Resim':
      categoryText = '🔖 Kategori: 4 foto 1 şəkil';
      answerText = '🧩 4 fotoya uygun cevabı bul chate yaz';
      break;
    case 'Bayrak':
      categoryText = '🔖 Kategori: Bayraq';
      answerText = '🧩 Bayraqlara uygun cevabı bul chate yaz';
      break;
    default:
      categoryText = '';
      answerText = '';
  }
  const caption = `${categoryText}\n\n🎲 Raund: ${game.round}/30\n\n${answerText}\n\n🔠 İlk Harf: ${game.currentPhoto[0]}\n\nℹ Uzunluk: ${photoName.length}`;
  if (game.round === 1) {
    bot.sendMessage(chatId, `${game.category} Kategorisinde Oyun başladı! İyi eğlenceler!`);
  }

  // Create a Skip button if it's not the last round
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Skip', callback_data: 'skip' },
      ],
    ],
  };

  bot.sendPhoto(chatId, fs.readFileSync(photoPath), {
    caption: caption,
    reply_markup: game.round < 30 ? keyboard : null, // Add the keyboard if it's not the last round
  }).then(() => {
    game.timer = setTimeout(() => {
      bot.sendMessage(chatId, 'Süre doldu! Cevap verilmediği için oyun kapatıldı.');
      endGame(chatId);
    }, 120000);
  });
}

bot.on('message', (msg) => {
  if (!game.active) return;
  const chatId = msg.chat.id;
  const answer = msg.text.trim().toLowerCase();
  if (answer === '/stop') {
    clearTimeout(game.timer);
    endGame(chatId);
    return;
  }
  const correctAnswer = game.currentPhoto.split('.')[0].toLowerCase();
  if (answer === correctAnswer) {
    clearTimeout(game.timer);
    increaseScore(msg.from.first_name);
    game.round++;
    const totalScore = Object.values(game.scores).reduce((a, b) => a + b, 0);
    bot.sendMessage(
      chatId,
      `🎉 Tebrikler ${msg.from.first_name}, soruyu doğru tahmin ettiniz! 🎁(+1)\n⭐ Toplam puanınız: ${totalScore}\n✅ Doğru cevap: ${correctAnswer}`
    ).then(() => {
      if (game.photos.length === 0) {
        endGame(chatId);
      } else {
        bot.sendMessage(chatId, "Bu soruyu buldunuz, yeni soruya geçiyorum!").then(() => {
          sendNextPhoto(chatId);
        });
      }
    });
  }
});

function increaseScore(username) {
  if (!game.scores[username]) {
    game.scores[username] = 1;
  } else {
    game.scores[username]++;
  }
}

function endGame(chatId) {
  game.active = false;
  clearTimeout(game.timer);
  const scores = game.scores;
  let scoreText = 'Oyun bitti!\n\nPuan Tablosu:\n';
  Object.keys(scores).forEach((username, index) => {
    const firstName = username;
    scoreText += `🏆 ${index + 1}. ${firstName}: ${scores[username]}\n`;
  });
  bot.sendMessage(chatId, scoreText);

  Object.keys(scores).forEach((username) => {
    if (!rating[chatId]) {
      rating[chatId] = {};
    }
    if (!rating[chatId][username]) {
      rating[chatId][username] = 0;
    }
    rating[chatId][username] += scores[username];
  });
  writeDb(rating);
  game.scores = {};
}

function getPhotos(category) {
  const photoDir = photoPaths[category];
  const photos = fs.readdirSync(photoDir);
  return photos.slice(0, 30);
}

rating = readDb();

bot.onText(/\/rating/, (msg) => {
  const chatId = msg.chat.id;
  if (msg.chat.type === 'private') {
    bot.sendMessage(chatId, 'Özel sohbetlerde /rating komutu çalışmamaktadır.');
    return;
  }
  if (!rating[chatId]) {
    bot.sendMessage(chatId, 'Henüz bir rating tablosu bulunmamaktadır.');
    return;
  }
  const groupRating = rating[chatId];
  const sortedRating = Object.keys(groupRating)
    .sort((a, b) => groupRating[b] - groupRating[a])
    .slice(0, 25);
  const ratingText = sortedRating
    .map((username, index) => {
      const firstName = username;
      const score = groupRating[username];
      return `🏅 ${index + 1}. ${firstName}: ${score}`;
    })
    .join('\n');
  bot.sendMessage(chatId, `Rating Tablosu:\n${ratingText}`);
});

bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  if (msg.chat.type === 'private') {
    bot.sendMessage(chatId, 'Özel sohbetlerde /stop komutu çalışmamaktadır.');
    return;
  }
  clearTimeout(game.timer);
  endGame(chatId);
});

bot.onText(/\/globalrating/, (msg) => {
  const chatId = msg.chat.id;
  const globalRating = {};
  Object.values(rating).forEach((groupRating) => {
    Object.entries(groupRating).forEach(([username, score]) => {
      if (!globalRating[username]) {
        globalRating[username] = 0;
      }
      globalRating[username] += score;
    });
  });
  const sortedGlobalRating = Object.keys(globalRating)
    .sort((a, b) => globalRating[b] - globalRating[a])
    .slice(0, 25);
  const globalRatingText = sortedGlobalRating
    .map((username, index) => {
      const firstName = username;
      const score = globalRating[username];
      return `🏅 ${index + 1}. ${firstName}: ${score}`;
    })
    .join('\n');
  bot.sendMessage(chatId, `Global Rating Tablosu:\n${globalRatingText}`);
});

bot.onText(/\/dbal/, (msg) => {
  const chatId = msg.chat.id;
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (msg.from.id.toString() === botOwnerId) {
    const dbFilePath = './db.json';
    const fileOptions = {
      filename: 'db.json',
      contentType: 'application/json',
    };
    bot.sendDocument(chatId, dbFilePath, {}, fileOptions)
      .then(() => {
        console.log('Dosya gönderildi');
      })
      .catch((error) => {
        console.error('Dosya gönderilirken bir hata oluştu:', error.message);
      });
  } else {
    bot.sendMessage(chatId, 'Bu komutu yalnızca bot sahibi kullanabilir.');
  }
});

bot.startPolling();
