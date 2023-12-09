const admin = require("firebase-admin");
const serviceAccount = 'animelinks-dae03-firebase-adminsdk-isnl5-90ac2682c8.json';

const firebaseConfig = {
  apiKey: "AIzaSyDNqqxL3iYZ8FDw-granwkb8V4aH_yFJxg",
  authDomain: "animelinks-dae03.firebaseapp.com",
  databaseURL: "https://animelinks-dae03-default-rtdb.firebaseio.com",
  projectId: "animelinks-dae03",
  storageBucket: "animelinks-dae03.appspot.com",
  messagingSenderId: "811021963612",
  appId: "1:811021963612:web:d49bd945c911d1ddc73199",
  measurementId: "G-C807QN1Q60"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://animelinks-dae03-default-rtdb.firebaseio.com"
});

const TelegramBot = require('node-telegram-bot-api');
const token = '6485121355:AAFcbr-xlGizEHT7nQBEmUgVaOu8rLIpIbQ'; // Replace with your bot token
const bot = new TelegramBot(token, { polling: true });
const conversations = {};

function animeExists(animeName) {
  return admin.database().ref(`/animes/${animeName}`).once('value')
    .then((snapshot) => {
      return snapshot.exists();
    });
}

function isNumber(input) {
  return /^\d+$/.test(input);
}

async function getThumbnailLinkFromFirebase(animeName, season) {
  const thumbnailPath = `/animes/${animeName}/seasons/${season}/p/thumbnail`;

  try {
    const snapshot = await admin.database().ref(thumbnailPath).once('value');
    const thumbnailLink = snapshot.val();

    if (thumbnailLink) {
      return thumbnailLink;
    } else {
      console.log('Thumbnail link not found for dbPath:', thumbnailPath);
      return null;
    }
  } catch (error) {
    console.error('Error retrieving thumbnail link:', error);
    return null;
  }
}

async function getEpisodeLinkFromFirebase(animeName, season, language, episode) {
  const dbPath = `/animes/${animeName}/seasons/${season}/languages/${language}/${episode}/link`;

  try {
    const snapshot = await admin.database().ref(dbPath).once('value');
    const episodeLink = snapshot.val();

    if (episodeLink) {
      return episodeLink;
    } else {
      console.log('Episode link not found for dbPath:', dbPath);
      return null;
    }
  } catch (error) {
    console.error('Error retrieving episode link:', error);
    return null;
  }
}

function askForAnimeName(chatId) {
  bot.sendMessage(chatId, 'Please enter the name of the anime:');
}

function askForSeason(chatId) {
  bot.sendMessage(chatId, 'Choose a season (e.g., 1, 2),For Movies got to this bot https://t.me/MoiesAnimebot');
}

function askForLanguage(chatId) {
  bot.sendMessage(chatId, 'Choose a language: English(E), Hindi(H), Japanese(J)', {
    reply_markup: {
      keyboard: [['E', 'H', 'J']],
      resize_keyboard: true,
      one_time_keyboard: true,
    }
  });
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.getChatMember('@AnimeLabOfficial', chatId)
    .then((chatMember) => {
      if (chatMember.status === 'member' || chatMember.status === 'administrator' || chatMember.status === 'creator') {
        bot.sendMessage(chatId, 'Hello! I am your Anime Search Bot. What anime are you looking for?');
        conversations[chatId] = { step: 1, data: {} };
        askForAnimeName(chatId);
      } else {
        bot.sendMessage(chatId, 'To use this bot, please join our channel @AnimeLabOfficial.');
      }
    })
    .catch((error) => {
      console.error('Error checking channel membership:', error);
    });
});

bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  let userMessage = msg.text;
  const userData = conversations[chatId];

  if (!userData) {
    return;
  }

  userMessage = userMessage.toLowerCase().trim();

  switch (userData.step) {
    case 1:
      userData.data.animeName = userMessage;
      animeExists(userData.data.animeName)
        .then((exists) => {
          if (exists) {
            userData.step++;
            askForSeason(chatId);
          } else if (userMessage === 'cancel') {
            bot.sendMessage(chatId, 'You have canceled the operation.');
            delete conversations[chatId];
          } else {
            bot.sendMessage(chatId, 'Anime not found. Please check the anime name and try again or type "cancel" to exit.     if the probelm still presists , you can contact on instagram :https://www.instagram.com/anime_lab_10/  , Email : labanime26@gmail.com , or you can request Anime at this bot : https://t.me/RequestAnimmebot ');
          }
        })
        .catch((error) => {
          console.error('Error checking if anime exists:', error);
        });
      break;

    case 2:
      if (isNumber(userMessage)) {
        userData.data.season = userMessage;
        userData.step++;

        // Retrieve the selected season's thumbnail
        const { animeName, season } = userData.data;
        getThumbnailLinkFromFirebase(animeName, season)
          .then((thumbnailLink) => {
            if (thumbnailLink) {
              bot.sendPhoto(chatId, thumbnailLink);
              askForLanguage(chatId);
            } else {
              bot.sendMessage(chatId, 'No thumbnail found for this season.');
            }
          })
          .catch((error) => {
            console.error('Error retrieving thumbnail link:', error);
            bot.sendMessage(chatId, 'An error occurred while fetching thumbnail link.');
          });
      } else {
        bot.sendMessage(chatId, 'Please enter a valid season number (e.g., 1, 2) , .');
      }
      break;

    case 3:
      if (userMessage === 'e' || userMessage === 'h' || userMessage === 'j') {
        userData.data.language = userMessage;
        userData.step++;
        if (userMessage === 'j') {
          // If the user chose Japanese (J), consider it as English (E) and proceed.
          userData.data.language = 'e';
        }

        // Fetch and send all episodes directly without asking for episode number
        const { animeName, season, language } = userData.data;
        const episodes = await getAllEpisodes(animeName, season, language);

        if (episodes.length > 0) {
          bot.sendMessage(chatId, 'Here are the all episodes...');
          await forwardAllEpisodes(chatId, animeName, season, language, episodes);
        } else {
          bot.sendMessage(chatId, 'No episodes found for this season.');
        }

        delete conversations[chatId];
      } else {
        bot.sendMessage(chatId, 'Please select a valid language: E, H, or J.');
      }
      break;
  }
});

async function getAllEpisodes(animeName, season, language) {
  const dbPath = `/animes/${animeName}/seasons/${season}/languages/${language}`;
  try {
    const snapshot = await admin.database().ref(dbPath).once('value');
    const episodes = snapshot.val();
    return episodes ? Object.keys(episodes) : [];
  } catch (error) {
    console.error('Error retrieving episodes:', error);
    return [];
  }
}

async function forwardAllEpisodes(chatId, animeName, season, language, episodes) {
  for (const episode of episodes) {
    const episodeLink = await getEpisodeLinkFromFirebase(animeName, season, language, episode);
    if (episodeLink) {
      await bot.sendVideo(chatId, episodeLink);
    } else {
      bot.sendMessage(chatId, `Failed to retrieve the link for Episode ${episode}.`);
    }
  }
}
