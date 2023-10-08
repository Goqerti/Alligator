require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const token = process.env.TOKEN;

// Kategoriler ve fotoğraf dosya yollarını buraya girin
const categories = ['Logo', 'Resim', 'Bayrak'];
const photoPaths = {
  Logo: './logo_fotolar',
  Resim: './resim_fotolar',
  Bayrak: './bayrak_fotolar',
};

// Oyun durumu
const game = {
  active: false,
  category: '',
  photos: [],
  currentPhoto: null,
  round: 1,
  scores: {},
  timer: null,
};

// Rating tabloları
let rating = {};

// Veritabanı işlemleri
const dbFile = './db.json';

// Veritabanı dosyasını oku
function readDb() {
  try {
    const data = fs.readFileSync(dbFile);
    return JSON.parse(data);
  } catch (err) {
    console.error(err);
    return {};
  }
}

// Veritabanı dosyasına yaz
function writeDb(data) {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(data));
  } catch (err) {
    console.error(err);
  }
}

// Telegram Bot'u oluştur
const bot = new TelegramBot(token, { polling: true });

// /game komutuna yanıt ver
bot.onText(/\/game/, (msg) => {
  const chatId = msg.chat.id;
  if (game.active) {
    bot.sendMessage(chatId, 'Bir oyun zaten devam ediyor! Lütfen mevcut oyunu bitirin.');
    return;
  }
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
    // Kategori seçimi için gönderilen mesajı ve butonları sil
    setTimeout(() => {
      bot.deleteMessage(chatId, sentMessage.message_id.toString());
    }, 6000); // 5 saniye (5000 ms) sonra sil
  });
});

// Kategori seçimine yanıt ver
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

// Fotoğrafı gönder ve sonraki fotoğrafa geç
function sendNextPhoto(chatId) {
  if (game.photos.length === 0) {
    if (Object.keys(game.scores).length > 0) {
      endGame(chatId);
    } else {
      bot.sendMessage(chatId, 'Oyun bitti, hiç puan alınamadı!');
      endGame(chatId);
    }
    return;
  }
  const photoIndex = Math.floor(Math.random() * game.photos.length);
  game.currentPhoto = game.photos[photoIndex];
  game.photos.splice(photoIndex, 1);
  const photoPath = `${photoPaths[game.category]}/${game.currentPhoto}`;
  const caption = `Round ${game.round}\n\nFotoğrafı bulduğunuzda cevabı yazın. Oyuna devam etmek için /devam, oyundan çıkmak için /stop komutlarını kullanabilirsiniz.`;
  if (game.round === 1) {
    bot.sendMessage(chatId, `${game.category} Kategorisinde Oyun başladı! İyi eğlenceler!`);
  }
  bot.sendPhoto(chatId, fs.readFileSync(photoPath), {
    caption: caption,
  }).then(() => {
    // Fotoğraf gönderildikten sonra tebrik mesajı ve bir sonraki fotoğrafı gönder
    game.timer = setTimeout(() => {
      bot.sendMessage(chatId, 'Süre doldu! Cevap verilmediği için oyun kapatıldı.');
      endGame(chatId);
    }, 120000); // 2 dakika (120000 ms) süre ayarlayın
  });
}

// Cevap kontrolü yap
bot.onText(/(.+)/, (msg, match) => {
  if (!game.active) return;
  const chatId = msg.chat.id;
  const answer = match[1].trim().toLowerCase();
  if (answer === '/stop') {
    if (!game.active) {
      bot.sendMessage(chatId, 'Aktif bir oyun yok.');
      return;
    }
    clearTimeout(game.timer);
    endGame(chatId);
    return;
  }
  if (!game.active) {
    bot.sendMessage(chatId, 'Aktif bir oyun yok.');
    return;
  }
  if (answer === game.currentPhoto.split('.')[0].toLowerCase()) {
    clearTimeout(game.timer);
    increaseScore(msg.from.first_name);
    game.round++;
    const totalScore = Object.values(game.scores).reduce((a, b) => a + b, 0);
    bot.sendMessage(
      chatId,
      `🎉 Tebrikler ${msg.from.first_name}, soruyu doğru tahmin ettiniz! 🎁(+1)\n⭐ Toplam puanınız: ${totalScore}\n✅ Doğru cevap: ${game.currentPhoto.split('.')[0]}`
    ).then(() => {
      if (game.round === 2) {
        bot.sendMessage(chatId, "Bu soruyu buldunuz, yeni soruya geçiyorum!");
      }
      sendNextPhoto(chatId);
    });
  }
});

// Skoru artır
function increaseScore(username) {
  if (!game.scores[username]) {
    game.scores[username] = 1;
  } else {
    game.scores[username]++;
  }
}

// Oyunu bitir ve puanları veritabanına yaz
function endGame(chatId) {
  game.active = false;
  clearTimeout(game.timer);
  const scores = game.scores;
  // Puanları rating tablosuna ekle
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
  const scoreText = 'Oyun bitti!\n\nPuan Tablosu:\n' +
    (Object.keys(scores).length > 0 ?
      Object.keys(scores).map((username, index) => `${getMedalEmoji(index + 1)} ${index + 1}. ${username}: ${scores[username]}`).join('\n') :
      "Bu raund kimse puan kazanmadı!");
  bot.sendMessage(chatId, scoreText);
  if (game.round > 1) {
    delete game.scores;
    bot.sendMessage(chatId, 'Oyun bitti!');
  }
}

// Kategoriye ait fotoğrafları getir
function getPhotos(category) {
  const photoDir = photoPaths[category];
  const photos = fs.readdirSync(photoDir);
  return photos.slice(0, 30); // Sadece ilk 30 fotoğrafı al
}

// Madalya emoji'si al
function getMedalEmoji(index) {
  if (index === 1) {
    return '🥇';
  } else if (index === 2) {
    return '🥈';
  } else if (index === 3) {
    return '🥉';
  } else {
    return '🏅';
  }
}

// Rating tablolarını yükle
rating = readDb();

// /rating komutuna yanıt ver
bot.onText(/\/rating/, (msg) => {
  const chatId = msg.chat.id;
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
      return `${getMedalEmoji(index + 1)} ${index + 1}. ${firstName}: ${score} puan`;
    })
    .join('\n');
  bot.sendMessage(chatId, `Rating Tablosu:\n${ratingText}`);
});

// /globalrating komutuna yanıt ver
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
      return `${getMedalEmoji(index + 1)} ${index + 1}. ${firstName}: ${score}`;
    })
    .join('\n');
  bot.sendMessage(chatId, `Global Rating Tablosu:\n${globalRatingText}`);
});

// /dbal komutuna yanıt ver
bot.onText(/\/dbal/, (msg) => {
  const chatId = msg.chat.id;
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
});
// Botu çalıştır
bot.startPolling();
