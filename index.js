const TelegramBot = require('node-telegram-bot-api');
const chalk = require('chalk');
const config = require('./config');
const db = require('./db');
const handlers = require('./handlers');
const courses = require('./courses');

if (!config.TELEGRAM_BOT_TOKEN) {
  console.error(chalk.red('❌ TELEGRAM_BOT_TOKEN is missing in .env file'));
  process.exit(1);
}

const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

// ==================== CRASH PREVENTION (top priority fix) ====================
// This is almost certainly why the bot dies in your hosting panel. Node kills
// the *entire* process on an unhandled promise rejection or an exception thrown
// outside a try/catch — one bad Telegram API call (user blocked the bot, a
// message was too old to edit, a malformed callback_data from a stale button)
// was enough to take the whole bot offline for every user until the panel
// restarted it. These two listeners are a last-resort safety net: they log the
// error so you can see what actually happened, but they do NOT let it crash
// the process. Keep these as close to the top of the file as possible.
process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('🚨 Unhandled Rejection (bot kept running):'), reason);
});
process.on('uncaughtException', (error) => {
  console.error(chalk.red('🚨 Uncaught Exception (bot kept running):'), error);
});

console.log(chalk.cyan(`
╔════════════════════════════════════╗
║                                    ║
║      🚀 MIRA-TECH Bot Started     ║
║   Premium Learning Platform       ║
║                                    ║
╚════════════════════════════════════╝
`));

// ==================== COMMAND HANDLERS ====================

bot.onText(/\/start/, async (msg) => {
  try {
    await handlers.start(bot, msg);
  } catch (error) {
    console.error(chalk.red('/start error:'), error);
  }
});

bot.onText(/\/help/, (msg) => {
  const text = `
🆘 *MIRA-TECH Help*

*Available Commands:*
/start - Show main menu
/help - Show this help
/profile - View your profile
/daily - Today's Daily Challenge question
/pay <id> - Activate premium (admin only)
/courses - List all courses
/stats - View bot statistics
/leaderboard - Top 10 learners

*How It Works:*
1. Click "Courses" to choose what to learn
2. Complete lessons to earn points
3. Tap "🔎 Explain This Deeper" on any lesson for common mistakes, extra explanation, and a mini FAQ
4. Take tests to prove your knowledge
5. Do the Daily Challenge for a quick bonus + streak
6. Collect achievements & unlock rewards
7. Finish a whole course to get a certificate
8. Reach top of leaderboard!

*Upgrade to Premium:*
Send /premium to unlock Bot Creation Masterclass

Need more help? Contact admin via /contact
  `;
  
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.onText(/\/daily/, async (msg) => {
  try {
    await handlers.handleDailyChallenge(bot, msg, false);
  } catch (error) {
    console.error(chalk.red('/daily error:'), error);
  }
});

// NEW: /stats now shows real numbers pulled from the database instead of the
// old hardcoded "Counting..." / "Tracking..." placeholders.
bot.onText(/\/stats/, (msg) => {
  const s = db.getStats();
  const text = `
📊 *MIRA-TECH Statistics*

🤖 Bot: Active & Running
📚 Courses: 4 (1 Premium)
👥 Total Students: ${s.totalUsers}
💎 Premium Students: ${s.premiumUsers}
🟢 Active Today: ${s.activeToday}
⭐ Total Points Awarded: ${s.totalPoints}

*Available Learning Paths:*
🟨 JavaScript Fundamentals
🟩 Node.js Mastery
🐍 Python Programming
🤖 Bot Creation Masterclass (Premium)

Start learning now: /start
  `;
  
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' }).catch(() => {});
});

// ==================== CALLBACK HANDLERS ====================

bot.on('callback_query', async (query) => {
  const data = query.data;
  
  try {
    // Menu navigation
    if (data === 'menu') {
      const handlers_module = require('./handlers');
      const text = `
╔═══════════════════════════════╗
║  🚀 Welcome to MIRA-TECH 🚀  ║
║   Premium Learning Platform   ║
╚═══════════════════════════════╝

What would you like to do?
      `;
      
      bot.editMessageText(text, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📚 Courses', callback_data: 'courses' }],
            [{ text: '🎯 Daily Challenge', callback_data: 'daily' }],
            [{ text: '👤 My Profile', callback_data: 'profile' }],
            [{ text: '🏆 Leaderboard', callback_data: 'leaderboard' }],
            [{ text: '💎 Premium', callback_data: 'premium' }]
          ]
        }
      });
    }
    
    // Courses
    else if (data === 'courses') {
      await handlers.handleCourses(bot, query);
    }
    
    // Course selection
    else if (data.startsWith('course_')) {
      const courseId = data.replace('course_', '');
      await handlers.handleCourseSelect(bot, query, courseId);
    }
    
    // Lessons
    else if (data.startsWith('lesson_')) {
      // courseId itself can contain underscores (e.g. "bot_creation"), so take the
      // lesson index off the END rather than assuming courseId is a single segment.
      const parts = data.replace('lesson_', '').split('_');
      const lessonIndex = parseInt(parts.pop());
      const courseId = parts.join('_');
      await handlers.handleLesson(bot, query, courseId, lessonIndex);
    }
    
    // Complete lesson
    else if (data.startsWith('complete_')) {
      const parts = data.replace('complete_', '').split('_');
      const lessonIndex = parseInt(parts.pop());
      const courseId = parts.join('_');
      await handlers.completeLesson(bot, query, courseId, lessonIndex);
    }
    
    // Deep dive on a lesson
    else if (data.startsWith('deepdive_')) {
      const parts = data.replace('deepdive_', '').split('_');
      const lessonIndex = parseInt(parts.pop());
      const courseId = parts.join('_');
      await handlers.handleDeepDive(bot, query, courseId, lessonIndex);
    }
    
    // Course progress view (this button previously had no handler)
    else if (data.startsWith('progress_')) {
      const courseId = data.replace('progress_', '');
      await handlers.handleProgress(bot, query, courseId);
    }
    
    // Achievements list (this button previously had no handler)
    else if (data === 'achievements') {
      await handlers.handleAchievements(bot, query);
    }
    
    // Daily challenge
    else if (data === 'daily') {
      await handlers.handleDailyChallenge(bot, query, true);
    }
    else if (data.startsWith('daily_')) {
      const optIndex = parseInt(data.replace('daily_', ''));
      await handlers.handleDailyAnswer(bot, query, optIndex);
    }
    
    // Start a lesson's Quick Test
    else if (data.startsWith('test_')) {
      const parts = data.replace('test_', '').split('_');
      const lessonIndex = parseInt(parts.pop());
      const courseId = parts.join('_');
      await handlers.handleTest(bot, query, courseId, lessonIndex);
    }
    
    // Answer a quiz question
    else if (data.startsWith('quiz_')) {
      const parts = data.replace('quiz_', '').split('_');
      const qIndex = parseInt(parts[0]);
      const optIndex = parseInt(parts[1]);
      await handlers.handleQuizAnswer(bot, query, qIndex, optIndex);
    }
    
    // Advance to next question / results screen
    else if (data === 'quizcontinue') {
      await handlers.handleQuizContinue(bot, query);
    }
    
    // Profile
    else if (data === 'profile') {
      await handlers.handleProfile(bot, query);
    }
    
    // Leaderboard
    else if (data === 'leaderboard') {
      await handlers.handleLeaderboard(bot, query);
    }
    
    // Premium
    else if (data === 'premium') {
      await handlers.handlePremium(bot, query);
    }
    
    // Continue learning
    else if (data === 'continue') {
      const text = '📚 Choose a course to continue learning:';
      bot.editMessageText(text, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🟨 JavaScript', callback_data: 'course_javascript' }],
            [{ text: '🟩 Node.js', callback_data: 'course_nodejs' }],
            [{ text: '🐍 Python', callback_data: 'course_python' }],
            [{ text: '⬅️ Back', callback_data: 'menu' }]
          ]
        }
      });
    }
    
  } catch (error) {
    console.error(chalk.red('Callback error:'), error);
    bot.answerCallbackQuery(query.id, '❌ An error occurred', true);
  }
});

// ==================== ADMIN COMMANDS ====================

bot.onText(/\/pay (.+)/, async (msg, match) => {
  try {
    const adminId = msg.from.id.toString();

    if (adminId !== config.ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }

    const userId = match[1].trim();

    if (db.isPremium(userId)) {
      return bot.sendMessage(msg.chat.id, '✅ User is already premium');
    }

    db.addPremium(userId);
    bot.sendMessage(msg.chat.id, `✅ Premium activated for user ${userId}`).catch(() => {});
    // This is the classic crash spot: userId here is admin-typed text, not a
    // chat this bot has necessarily talked to. If that user never pressed
    // /start, or blocked the bot, Telegram rejects the send — .catch() stops
    // that rejection from taking the whole bot down, and tells the admin why.
    bot.sendMessage(userId, '🎉 *Your premium access is now active!*\n\n🤖 You can now access the Bot Creation Masterclass and all premium features!', { parse_mode: 'Markdown' })
      .catch(err => {
        bot.sendMessage(msg.chat.id, `⚠️ Premium was activated for ${userId}, but I couldn't message them directly (they may not have started the bot yet). Error: ${err.message}`).catch(() => {});
      });
  } catch (error) {
    console.error(chalk.red('/pay error:'), error);
  }
});

bot.onText(/\/removeprem (.+)/, async (msg, match) => {
  try {
    const adminId = msg.from.id.toString();

    if (adminId !== config.ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }

    const userId = match[1].trim();
    db.removePremium(userId);
    bot.sendMessage(msg.chat.id, `✅ Premium removed for user ${userId}`).catch(() => {});
  } catch (error) {
    console.error(chalk.red('/removeprem error:'), error);
  }
});

bot.onText(/\/premiumlist/, async (msg) => {
  try {
    const adminId = msg.from.id.toString();

    if (adminId !== config.ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }

    const premiumUsers = db.getPremiumUsers();
    let text = '💎 *Premium Users:*\n\n';

    Object.keys(premiumUsers).forEach((userId, i) => {
      const user = db.getUser(userId);
      text += `${i + 1}. ${user ? user.firstName : 'Unknown'} (${userId})\n`;
    });

    bot.sendMessage(msg.chat.id, text || 'No premium users yet', { parse_mode: 'Markdown' }).catch(() => {});
  } catch (error) {
    console.error(chalk.red('/premiumlist error:'), error);
  }
});

// NEW: /broadcast <message> — send an announcement to every registered user.
// Sends are throttled and individually caught so one blocked/deleted user
// can't stop the rest of the broadcast, and the admin gets a delivery summary.
bot.onText(/\/broadcast ([\s\S]+)/, async (msg, match) => {
  try {
    const adminId = msg.from.id.toString();
    if (adminId !== config.ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }

    const message = match[1].trim();
    const users = Object.keys(db.getAllUsers());

    if (users.length === 0) {
      return bot.sendMessage(msg.chat.id, 'No users to broadcast to yet.');
    }

    bot.sendMessage(msg.chat.id, `📣 Broadcasting to ${users.length} user(s)...`).catch(() => {});

    let sent = 0;
    let failed = 0;
    for (const userId of users) {
      try {
        await bot.sendMessage(userId, `📣 *Announcement from MIRA-TECH*\n\n${message}`, { parse_mode: 'Markdown' });
        sent++;
      } catch (err) {
        failed++;
      }
      // Small delay avoids tripping Telegram's rate limits on large user lists.
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    bot.sendMessage(msg.chat.id, `✅ Broadcast finished. Delivered: ${sent} | Failed (blocked/inactive): ${failed}`).catch(() => {});
  } catch (error) {
    console.error(chalk.red('/broadcast error:'), error);
  }
});

// NEW: /userinfo <id> — quick admin lookup of a single student's account.
bot.onText(/\/userinfo (.+)/, async (msg, match) => {
  try {
    const adminId = msg.from.id.toString();
    if (adminId !== config.ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }

    const userId = match[1].trim();
    const user = db.getUser(userId);
    if (!user) {
      return bot.sendMessage(msg.chat.id, `❌ No user found with ID ${userId}`);
    }

    const isPrem = db.isPremium(userId);
    const achievementsList = db.getAchievements(userId);
    const text = `
👤 *User Info — ${user.firstName}*

ID: \`${userId}\`
Status: ${isPrem ? '✅ Premium' : '⭐ Free'}
Points: ${user.points}
Level: ${user.level}
Streak: ${user.streak || 0} 🔥
Total active days: ${user.totalActiveDays || 0}
Achievements: ${achievementsList.length}
Joined: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
Last active: ${user.lastActive ? new Date(user.lastActive).toLocaleString() : 'Unknown'}
    `;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' }).catch(() => {});
  } catch (error) {
    console.error(chalk.red('/userinfo error:'), error);
  }
});

bot.onText(/\/adminhelp/, async (msg) => {
  try {
    const adminId = msg.from.id.toString();

    if (adminId !== config.ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, '❌ Admin only command');
    }

    const text = `
🔑 *Admin Commands*

/pay <user_id> - Activate premium for user
/removeprem <user_id> - Remove premium
/premiumlist - List all premium users
/userinfo <user_id> - Look up one student's account
/broadcast <message> - Message every registered user
/adminhelp - Show this menu
/stats - Bot statistics
  `;

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' }).catch(() => {});
  } catch (error) {
    console.error(chalk.red('/adminhelp error:'), error);
  }
});

// ==================== ERROR HANDLING ====================

bot.on('polling_error', (error) => {
  console.error(chalk.red('Polling error:'), error);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n🛑 Bot shutting down gracefully...'));
  bot.stopPolling();
  process.exit(0);
});

console.log(chalk.green('✅ Bot is ready and listening for messages...'));
