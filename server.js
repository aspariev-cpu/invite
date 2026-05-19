require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const ROLE_1_ID = process.env.ROLE_1_ID;
const ROLE_2_ID = process.env.ROLE_2_ID;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const RESPONSE_CHANNEL_ID = process.env.RESPONSE_CHANNEL_ID;
const NOTIFICATION_ROLE_ID = process.env.NOTIFICATION_ROLE_ID;

// Используем memoryStorage - файлы не сохраняются на диск
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Только изображения!"));
    }
  }
});

const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]
});

let botReady = false;

bot.once("ready", () => {
  console.log(`✅ Бот запущен: ${bot.user.tag}`);
  botReady = true;
});

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, discordId, applicationId] = interaction.customId.split("|");

  if (action !== "approve" && action !== "deny") return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const hasRole = member.roles.cache.has(ROLE_1_ID) || member.roles.cache.has(ROLE_2_ID);

  if (!hasRole) {
    return interaction.reply({
      content: "❌ У вас нет прав для рассмотрения заявок.",
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const embed = interaction.message.embeds[0];
    
    const nameField = embed.fields.find(f => f.name === "Имя | Статик");
    const playerName = nameField ? nameField.value : "Игрок";
    
    const userMention = discordId && discordId !== "—" ? `<@${discordId}>` : "игрок";

    if (RESPONSE_CHANNEL_ID) {
      try {
        const responseChannel = await bot.channels.fetch(RESPONSE_CHANNEL_ID);
        
        let responseEmbed;
        let responseContent = "";
        
        if (NOTIFICATION_ROLE_ID) {
          responseContent = `<@&${NOTIFICATION_ROLE_ID}> `;
        }
        
        if (action === "approve") {
          responseContent += `✅ **ЗАЯВКА ОДОБРЕНА**\n👤 Отправитель: ${userMention}\n📝 Игрок: **${playerName}**`;
          responseEmbed = new EmbedBuilder()
            .setDescription(`Ваша заявка принята! Добро пожаловать в семью! 🎉\n\n🔊 **Заходи на обзвон:**\nhttps://discord.com/channels/1073398399799398430/1466404417095077899`)
            .setColor(0x00ff00)
            .addFields(
              { name: "Рассмотрел", value: interaction.user.tag, inline: true },
              { name: "Дата", value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: "GTA Family System" });
        } else {
          responseContent += `❌ **ЗАЯВКА ОТКЛОНЕНА**\n👤 Отправитель: ${userMention}\n📝 Игрок: **${playerName}**`;
          responseEmbed = new EmbedBuilder()
            .setDescription(`К сожалению, ваша заявка отклонена.`)
            .setColor(0xff0000)
            .addFields(
              { name: "Рассмотрел", value: interaction.user.tag, inline: true },
              { name: "Дата", value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: "GTA Family System" });
        }
        
        await responseChannel.send({
          content: responseContent,
          embeds: [responseEmbed]
        });
        
        console.log(`✅ Ответ отправлен в канал`);
      } catch(e) {
        console.log("❌ Не удалось отправить ответ в канал:", e.message);
      }
    }

    const newEmbed = EmbedBuilder.from(embed)
      .setColor(action === "approve" ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: "Статус", value: action === "approve" ? "✅ ПРИНЯТА" : "❌ ОТКЛОНЕНА", inline: false },
        { name: "Ответ отправлен", value: RESPONSE_CHANNEL_ID ? "✅ Да" : "❌ Канал не настроен", inline: false }
      )
      .setFooter({ text: `Рассмотрел: ${interaction.user.tag}` });

    await interaction.message.edit({
      embeds: [newEmbed],
      components: []
    });

    await interaction.editReply({
      content: action === "approve" ? "✅ Заявка принята! Ответ отправлен." : "❌ Заявка отклонена! Ответ отправлен."
    });

  } catch (err) {
    console.error(err);
    await interaction.editReply({
      content: "⚠️ Ошибка при обработке."
    });
  }
});

bot.login(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.post("/api/apply", upload.array("screenshots", 5), async (req, res) => {
  try {
    const { name, ooc, pref, families, discordId, charsLink } = req.body;
    const files = req.files || [];

    console.log("📩 НОВАЯ ЗАЯВКА:", { name, ooc, pref, families, discordId, charsLink });
    console.log("📸 Файлов загружено:", files.length);

    if (!botReady) {
      return res.status(500).json({ success: false, error: "Бот не готов" });
    }

    if (!name || !discordId) {
      return res.status(400).json({ success: false, error: "Заполните имя и Discord ID!" });
    }

    if (!/^\d+$/.test(discordId)) {
      return res.status(400).json({ success: false, error: "Discord ID должен содержать только цифры!" });
    }

    const userMention = `<@${discordId}>`;

    const embedFields = [
      { name: "Имя | Статик", value: name || "—", inline: false },
      { name: "ООС имя", value: ooc || "—", inline: true },
      { name: "Предпочтение", value: pref || "—", inline: true },
      { name: "В каких семьях был", value: families || "—", inline: false },
      { name: "Discord", value: userMention, inline: false }
    ];

    // Добавляем ссылку, если есть
    if (charsLink && charsLink.trim()) {
      embedFields.push({
        name: "📎 Ссылка на скриншоты",
        value: charsLink,
        inline: false
      });
    }
    
    // Если нет ни ссылки, ни файлов
    if ((!charsLink || !charsLink.trim()) && files.length === 0) {
      embedFields.push({ name: "📸 Скриншоты", value: "❌ Не предоставлены", inline: false });
    }

    const embed = {
      title: "📝 Новая заявка в семью ПЕХОТА",
      color: 7506394,
      fields: embedFields,
      footer: { text: "Нажмите кнопку для рассмотрения" },
      timestamp: new Date().toISOString()
    };

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`approve|${discordId}|${Date.now()}`)
          .setLabel("✅ Принять")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny|${discordId}|${Date.now()}`)
          .setLabel("❌ Отклонить")
          .setStyle(ButtonStyle.Danger)
      );

    const guild = await bot.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(CHANNEL_ID);

    // Подготавливаем файлы для отправки в Discord
    const attachments = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const extension = file.mimetype.split('/')[1];
      attachments.push({
        attachment: file.buffer,
        name: `screenshot_${i + 1}_${Date.now()}.${extension}`
      });
    }

    // Отправляем сообщение с вложениями
    await channel.send({
      content: `<@&${ROLE_1_ID}> <@&${ROLE_2_ID}> 📩 **НОВАЯ ЗАЯВКА!**\n👤 Отправитель: ${userMention}`,
      embeds: [embed],
      components: [row],
      files: attachments  // ← Файлы летят напрямую в Discord!
    });

    res.json({ success: true, message: "Заявка отправлена!" });

  } catch (err) {
    console.log("❌ ОШИБКА:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Сервер запущен: http://localhost:${PORT}`);
});
