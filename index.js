const express = require("express");
const app = express();

// 🔥 Render necesita esto YA mismo
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("bot vivo 😎");
});

// 🔥 IMPORTANTE: 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log("🌐 web activa en puerto", PORT);
});
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  Events,
} = require("discord.js");

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const fs = require("fs");
const path = require("path");

const PREFIX = "!";
const TMP = path.join(__dirname, "tmp");

if (!fs.existsSync(TMP)) {
  fs.mkdirSync(TMP);
}

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let tg;
let busy = false;
const queue = [];
const SELLERS_FILE = "./sellers.json";

let sellerIds = [];

if (fs.existsSync(SELLERS_FILE)) {
  sellerIds = JSON.parse(
    fs.readFileSync(SELLERS_FILE, "utf8")
  );
}
const BANS_FILE = "./bans.json";

let bans = {};

if (fs.existsSync(BANS_FILE)) {
  bans = JSON.parse(
    fs.readFileSync(
      BANS_FILE,
      "utf8"
    )
  );
}
const USERS_FILE =
  "./allowedUsers.json";
  const PLANS_FILE =
  "./plans.json";

let plans = {};

if (
  fs.existsSync(
    PLANS_FILE
  )
) {
  plans = JSON.parse(
    fs.readFileSync(
      PLANS_FILE,
      "utf8"
    )
  );
}

const ownerIds = [
  "1499573539563376704",
  "1496550477985218742"
];

let allowedUsers = [];

if (
  fs.existsSync(
    USERS_FILE
  )
) {
  allowedUsers =
    JSON.parse(
      fs.readFileSync(
        USERS_FILE,
        "utf8"
      )
    );
} else {

  allowedUsers = [
    ...ownerIds
  ];

  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(
      allowedUsers,
      null,
      2
    )
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startTelegram() {
  const session = new StringSession(
    process.env.TG_SESSION || ""
  );

  tg = new TelegramClient(
    session,
    Number(process.env.TG_API_ID),
    process.env.TG_API_HASH,
    {
      connectionRetries: 5,
    }
  );

  await tg.start({
    phoneNumber: async () =>
      await input.text("Número Telegram: "),

    password: async () =>
      await input.text("2FA: "),

    phoneCode: async () =>
      await input.text("Código Telegram: "),

    onError: console.log,
  });

  console.log("✅ Telegram conectado");

  if (!process.env.TG_SESSION) {
    console.log("\nGUARDA ESTA SESSION:\n");
    console.log(tg.session.save());
  }
}

function isProcessingMessage(msg) {
  const text = (msg.message || "")
    .toLowerCase();

  return (
    text.includes("procesando") ||
    text.includes("espere") ||
    text.includes("consultando") ||
    text.includes("cargando") ||
    text.includes("buscando") ||
    text.includes("un momento")
  );
}

function getFileName(tgMsg) {
  const media = tgMsg.media;

  if (!media)
    return `telegram_${Date.now()}.bin`;

  if (media.photo)
    return `telegram_${Date.now()}.jpg`;

  const doc = media.document;
  const mime = doc?.mimeType || "";

  if (doc?.attributes) {
    for (const attr of doc.attributes) {
      if (attr.fileName)
        return attr.fileName;
    }
  }

  if (mime.includes("application/pdf"))
    return `telegram_${Date.now()}.pdf`;

  if (mime.includes("text/plain"))
    return `telegram_${Date.now()}.txt`;

  if (mime.includes("image/jpeg"))
    return `telegram_${Date.now()}.jpg`;

  if (mime.includes("image/png"))
    return `telegram_${Date.now()}.png`;

  if (mime.includes("image/webp"))
    return `telegram_${Date.now()}.webp`;

  if (mime.includes("video/mp4"))
    return `telegram_${Date.now()}.mp4`;

  if (mime.includes("video"))
    return `telegram_${Date.now()}.mp4`;

  if (mime.includes("audio/mpeg"))
    return `telegram_${Date.now()}.mp3`;

  if (mime.includes("audio/ogg"))
    return `telegram_${Date.now()}.ogg`;

  if (mime.includes("audio"))
    return `telegram_${Date.now()}.mp3`;

  return `telegram_${Date.now()}.bin`;
}

function telegramButtonsToDiscord(msg) {
  if (!msg.replyMarkup?.rows) return [];

  const rows = [];

  msg.replyMarkup.rows.slice(0, 5).forEach((row, i) => {
    const discordRow = new ActionRowBuilder();

    row.buttons.slice(0, 5).forEach((btn, j) => {
      discordRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`tgbtn:${msg.id}:${i}:${j}`)
          .setLabel((btn.text || "Botón").slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    });

    rows.push(discordRow);
  });

  return rows;
}

async function getLastTelegramId() {
  const before =
    await tg.getMessages(
      process.env.TG_TARGET_CHAT,
      {
        limit: 1,
      }
    );

  return before[0]?.id || 0;
}

async function sendTextToTelegram(
  text
) {
  const beforeId =
    await getLastTelegramId();

  await tg.sendMessage(
    process.env.TG_TARGET_CHAT,
    {
      message: text,
    }
  );

  return await waitTelegramReplies(
    beforeId
  );
}

async function sendAttachmentToTelegram(
  attachment,
  caption = ""
) {
  const beforeId =
    await getLastTelegramId();

  const isFacial =
    caption.trim().toLowerCase().startsWith("/facial");

  const res = await fetch(attachment.url);
  const buffer = Buffer.from(await res.arrayBuffer());

  const ext =
    attachment.name?.split(".").pop() || "jpg";

  const filePath = path.join(
    TMP,
    `discord_${Date.now()}.${ext}`
  );

  fs.writeFileSync(filePath, buffer);

await tg.sendFile(
  process.env.TG_TARGET_CHAT,
  {
    file: filePath,
    caption: isFacial
      ? "/facial"
      : caption,
  },
  {
    forceDocument: false
  }
);

  fs.unlinkSync(filePath);

  return await waitTelegramReplies(
    beforeId
  );
}

async function waitTelegramReplies(
  beforeId,
  totalTime = 90000,
  interval = 1000
) {
  const targetBot =
    process.env.TG_TARGET_BOT
      .toLowerCase()
      .replace("@", "");

  let finalMessages =
    new Map();

  let lastSnapshot = "";
  let stableCount = 0;

  const start = Date.now();

  while (
    Date.now() - start <
    totalTime
  ) {
    await sleep(interval);

    const messages =
      await tg.getMessages(
        process.env
          .TG_TARGET_CHAT,
        {
          limit: 50,
        }
      );

    const valid = [];

    for (const msg of messages) {
      if (!msg) continue;

      // SOLO NUEVOS
      if (
        msg.id <= beforeId
      ) {
        continue;
      }

      // ignorar tuyos
      if (msg.out) {
        continue;
      }

      const sender =
        await msg
          .getSender()
          .catch(() => null);

      const username =
        sender?.username?.toLowerCase();

      // SOLO BOT TARGET
      if (
        username !== targetBot
      ) {
        continue;
      }

      // SOLO BOTS
      if (!sender?.bot) {
        continue;
      }

      const text =
        (
          msg.message ||
          msg.text ||
          ""
        ).toLowerCase();

      // IGNORAR LOADINGS
      const hasButtons =
  !!msg.replyMarkup?.rows;

const hasMedia =
  !!msg.media;

// IGNORAR LOADINGS
// PERO NO MENUS CON BOTONES
const isLoading =
        text.includes("procesando") ||
        text.includes("espera") ||
        text.includes("espere") ||
        text.includes("cargando") ||
        text.includes("buscando") ||
        text.includes("un momento") ||
        text.includes("bienvenido") ||
        text.includes("consultando");

      // Si es un mensaje de carga sin botones y sin archivos, 
      // lo ignoramos para que el bucle siga buscando el mensaje real que viene después.
      if (!hasButtons && !hasMedia && isLoading) {
        continue;
      }

      valid.push(msg);

      finalMessages.set(
        msg.id,
        msg
      );
    }

    const snapshot =
      valid
        .map(
          m =>
            `${m.id}:${m.message || ""}:${!!m.media}`
        )
        .join("|");

    if (
      snapshot ===
      lastSnapshot
    ) {
      stableCount++;
    } else {
      stableCount = 0;
      lastSnapshot =
        snapshot;
    }

    // ya terminó
    if (
      finalMessages.size >
        0 &&
      stableCount >= 3
    ) {
      break;
    }
  }

  const replies = [
    ...finalMessages.values(),
  ].sort(
    (a, b) => a.id - b.id
  );

  if (!replies.length) {
    throw new Error(
      "No encontré respuestas nuevas."
    );
  }

  return replies;
}
async function waitTelegramRepliesFromButton(
  clickedMsgId,
  beforeId,
  totalTime = 90000,
  interval = 1000
) {
  const targetBot =
    process.env.TG_TARGET_BOT
      .toLowerCase()
      .replace("@", "");

  const finalMessages =
    new Map();

  let lastSnapshot = "";
  let stableCount = 0;

  const start = Date.now();

  while (
    Date.now() - start <
    totalTime
  ) {
    await sleep(interval);

    const messages =
      await tg.getMessages(
        process.env
          .TG_TARGET_CHAT,
        {
          limit: 80,
        }
      );

    const valid = [];

    for (const msg of messages) {
      if (!msg) continue;
      if (msg.out) continue;

      const sender =
        await msg
          .getSender()
          .catch(() => null);

      const username =
        sender?.username?.toLowerCase();

      if (
        username !== targetBot
      )
        continue;

      if (!sender?.bot)
        continue;

      // SOLO RESPUESTA
      // DEL BOTÓN
      if (
        msg.id !==
          clickedMsgId &&
        msg.id <= beforeId
      ) {
        continue;
      }

      const rawText =
        msg.message ||
        msg.text ||
        "";

      const hasButtons =
        !!msg.replyMarkup
          ?.rows;

      const hasMedia =
        !!msg.media;

      if (
        !hasButtons &&
        !hasMedia &&
        isLoadingText(
          rawText
        )
      ) {
        continue;
      }

      valid.push(msg);

      finalMessages.set(
        msg.id,
        msg
      );
    }

    const snapshot =
      valid
        .map(
          m =>
            `${m.id}:${m.message || ""}:${!!m.media}`
        )
        .join("|");

    if (
      snapshot ===
      lastSnapshot
    ) {
      stableCount++;
    } else {
      stableCount = 0;
      lastSnapshot =
        snapshot;
    }

    if (
      finalMessages.size >
        0 &&
      stableCount >= 3
    ) {
      break;
    }
  }

  const replies = [
    ...finalMessages.values(),
  ].sort(
    (a, b) => a.id - b.id
  );

  if (!replies.length) {
    throw new Error(
      "No encontré respuesta del botón."
    );
  }

  return replies;
}
async function findLatestTelegramButtonMessage() {
  const latest =
    await tg.getMessages(
      process.env.TG_TARGET_CHAT,
      {
        limit: 40,
      }
    );

  const targetBot =
    process.env.TG_TARGET_BOT
      .toLowerCase()
      .replace("@", "");

  for (const msg of latest) {
    const sender =
      await msg
        .getSender()
        .catch(() => null);

    const username =
      sender?.username?.toLowerCase();

    if (
      username !== targetBot
    )
      continue;

    if (
      msg.replyMarkup?.rows
    )
      return msg;
  }

  return null;
}

async function downloadTelegramFile(
  tgMsg
) {
  const fileName =
    getFileName(tgMsg);

  const safeName = `${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}_${fileName}`;

  const filePath = path.join(
    TMP,
    safeName
  );

  const downloaded =
    await tgMsg.downloadMedia({
      outputFile: filePath,
    });

  const finalPath =
    downloaded || filePath;

  if (
    !fs.existsSync(finalPath)
  )
    return null;

  return {
    path: finalPath,
    name: fileName,
  };
}

function splitText(
  text,
  size = 1900
) {
  const chunks = [];
  let current = text || "";

  while (
    current.length > size
  ) {
    chunks.push(
      current.slice(0, size)
    );

    current =
      current.slice(size);
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

async function sendTelegramBatchToDiscord(
  target,
  replies,
  editFirst = false
) {
  const channel =
    target.channel;

  let content = "";
  let components = [];

  const files = [];

  for (const msg of replies) {
    console.log("MSG TELEGRAM:");
console.log(JSON.stringify(msg, null, 2));
    const text =
      msg.message ||
      msg.text ||
      "";

    if (text.trim()) {
      content += `${text}\n\n`;
    }

const msgButtons =
  telegramButtonsToDiscord(msg);

if (msgButtons.length) {
  components = msgButtons;
}
    if (msg.media) {
      try {
        const file =
          await downloadTelegramFile(
            msg
          );

        if (file) {
          files.push(file);
        }
      } catch (err) {
        console.error(
          "Error descargando media:",
          err
        );
      }
    }
  }

  if (!content.trim()) {
    content =
      "Telegram respondió 😎";
  }
  
  if (content.length > 50000) {
    const txtPath =
      path.join(
        TMP,
        `telegram_${Date.now()}.txt`
      );

    fs.writeFileSync(
      txtPath,
      content,
      "utf8"
    );

    const payload = {
      content:
        "📄 Respuesta enviada en TXT.",

      files: [
        new AttachmentBuilder(
          txtPath,
          {
            name:
              "respuesta.txt",
          }
        ),
      ],

      components,
    };

    if (
      editFirst &&
      target.edit
    ) {
      await target.edit(
        payload
      );
    } else {
      await channel.send(
        payload
      );
    }

    return;
  }

  const textChunks =
    splitText(content, 1900);

  const attachments =
    files.map(
      file =>
        new AttachmentBuilder(
          file.path,
          {
            name:
              file.name,
          }
        )
    );

  const firstPayload = {
    content:
      textChunks.shift() ||
      "Telegram respondió 😎",

    components,
  };

  if (
    attachments.length
  ) {
    firstPayload.files =
      attachments.splice(
        0,
        10
      );
  }

  if (
    editFirst &&
    target.edit
  ) {
    await target.edit(
      firstPayload
    );
  } else {
    await channel.send(
      firstPayload
    );
  }

  for (const chunk of textChunks) {
    await channel.send({
      content: chunk,
    });
  }

  while (
    attachments.length
  ) {
    await channel.send({
      content:
        "📎 Más archivos:",

      files:
        attachments.splice(
          0,
          10
        ),
    });
  }
}

discord.on(
  Events.MessageCreate,
  async message => {
    if (
      message.author.bot
    )
      return;

    if (
      !message.content.startsWith(
        PREFIX
      )
    )
      return;

    const args =
      message.content
        .slice(
          PREFIX.length
        )
        .trim()
        .split(/ +/);

    const command =
      args
        .shift()
        ?.toLowerCase();

if (
  command !== "tg" &&
  command !== "addaccess" &&
  command !== "removeaccess" &&
  command !== "addplan" &&
  command !== "removeplan" &&
  command !== "banuser" &&
  command !== "unbanuser" &&
  command !== "staff" &&
  command !== "addseller" &&
  command !== "removeseller" &&
  command !== "me"
)
  return;

// AGREGAR ACCESO
if (command === "addaccess") {

  // SOLO OWNERS
  if (
    !ownerIds.includes(
      message.author.id
    )
  ) {
    return message.reply(
      "❌ Solo owners."
    );
  }

  const target =
    message.mentions.users.first() ||
    args[0];

  if (!target) {
    return message.reply(
      "Uso: !addaccess @user o ID"
    );
  }

  const targetId =
    typeof target === "string"
      ? target
      : target.id;

  if (
    allowedUsers.includes(
      targetId
    )
  ) {
    return message.reply(
      "⚠️ Ya tiene acceso."
    );
  }

  allowedUsers.push(
    targetId
  );
  const now = new Date();

const days = 30; // <--- Aquí le dices que son 30 días fijazos
const end = new Date(
    now.getTime() +
    days * 24 * 60 * 60 * 1000
);
fs.writeFileSync(
  USERS_FILE,
  JSON.stringify(
    allowedUsers,
    null,
    2
  )
);
  return message.reply(
    `✅ Acceso dado a <@${targetId}>`
  );
} 

// REMOVER ACCESO
if (command === "removeaccess") {

  // SOLO OWNERS
  if (
    !ownerIds.includes(
      message.author.id
    )
  ) {
    return message.reply(
      "❌ Solo owners."
    );
  }

  const target =
    message.mentions.users.first() ||
    args[0];

  if (!target) {
    return message.reply(
      "Uso: !removeaccess @user o ID"
    );
  }

  const targetId =
    typeof target === "string"
      ? target
      : target.id;

  const index =
    allowedUsers.indexOf(
      targetId
    );

  if (index === -1) {
    return message.reply(
      "⚠️ No tiene acceso."
    );
  }

  allowedUsers.splice(
    index,
    1
  );

  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(
      allowedUsers,
      null,
      2
    )
  );

  return message.reply(
    `✅ Acceso removido a <@${targetId}>`
  );
}
if (command === "addplan") {
if (
  !ownerIds.includes(message.author.id) &&
  !sellerIds.includes(message.author.id)
) {
  return message.reply("❌ Solo owners o sellers.");
}

  const target =
    message.mentions.users.first() ||
    args[0];

  const targetId =
    typeof target === "string"
      ? target
      : target.id;

  const targetName =
    typeof target === "string"
      ? "ID"
      : target.username;

  const days = Number(args[1]);
  const plan = (args[2] || "PREMIUM").toUpperCase();

  if (!targetId || !days) {
    return message.reply(
      "Uso: !addplan @user 35 premium"
    );
  }

  const now = new Date();

  const end = new Date(
    now.getTime() +
    days *
      24 *
      60 *
      60 *
      1000
  );

  const formatDate = d =>
    d.toLocaleString(
      "es-PE",
      {
        timeZone:
          "America/Lima",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }
    );

  if (
    !allowedUsers.includes(
      targetId
    )
  ) {
    allowedUsers.push(
      targetId
    );
  }

  plans[targetId] = {
  expiresAt: end.getTime(),
  plan,
  days,
  addedBy: message.author.id,
  addedByName: message.author.username,
  addedByTag: message.author.tag,
  addedAt: Date.now()
};

  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(
      allowedUsers,
      null,
      2
    )
  );

  fs.writeFileSync(
    PLANS_FILE,
    JSON.stringify(
      plans,
      null,
      2
    )
  );

  return message.reply(
`EJECUTOR ➣ ${message.author.username} — ${message.author.id}

ACCIÓN ➣ AGREGADO: ${days} días ${plan}

USUARIO ➣ ${targetName} — ${targetId}

DÍAS RESTANTES ➣ ${days} días

FECHA FIN ➣ ${formatDate(end)}

FECHA ➣ ${formatDate(now)}

NOTIFICACIÓN:
✅ Se agregaron ${days} días ${plan} correctamente.`
  );
}
if (command === "banuser") {
  console.log("ENTRO AL BANUSER");

  if (!ownerIds.includes(message.author.id)) {
    return message.reply("❌ Solo owners.");
  }

  const target =
    message.mentions.users.first() ||
    args[0];

  const targetId =
    typeof target === "string"
      ? target
      : target.id;

  const reason =
    args.slice(1).join(" ") ||
    "Sin motivo";

if (!targetId) {
    return message.reply(
        "Uso: !banuser @user motivo"
    );
}

  delete plans[targetId];

  allowedUsers =
    allowedUsers.filter(
      id => id !== targetId
    );

  bans[targetId] = {
    reason,
    bannedBy: message.author.id,
    bannedByName: message.author.username,
    bannedAt: Date.now()
  };

  fs.writeFileSync(USERS_FILE, JSON.stringify(allowedUsers, null, 2));
  fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
  fs.writeFileSync(BANS_FILE, JSON.stringify(bans, null, 2));

 return message.reply(
`🔨 USUARIO BANEADO

USUARIO ➣ ${targetId}
MOTIVO ➣ ${reason}
BANEADO POR ➣ ${message.author.username} — ${message.author.id}`
);
}
if (command === "unbanuser") {

  if (!ownerIds.includes(message.author.id)) {
    return message.reply("❌ Solo owners.");
  }

  const targetId = args[0];

  if (!targetId) {
    return message.reply(
      "Uso: !unbanuser ID"
    );
  }

  delete bans[targetId];

  fs.writeFileSync(
    BANS_FILE,
    JSON.stringify(bans, null, 2)
  );

  return message.reply(
`✅ USUARIO DESBANEADO

USUARIO ➣ ${targetId}
DESBANEADO POR ➣ ${message.author.username}`
  );
}
if (command === "addseller") {

  if (!ownerIds.includes(message.author.id)) {
    return message.reply("❌ Solo owners.");
  }

  const target =
    message.mentions.users.first() ||
    args[0];

  const sellerId =
    typeof target === "string"
      ? target
      : target.id;

  const days = Number(args[1]);

  if (!sellerId) {
    return message.reply(
      "Uso: !addseller @user [días opcionales]"
    );
  }

  if (sellerIds.includes(sellerId) && (isNaN(days) || !days)) {
    return message.reply(
      "⚠️ Ya es seller."
    );
  }

  if (!sellerIds.includes(sellerId)) {
    sellerIds.push(sellerId);
    fs.writeFileSync(
      SELLERS_FILE,
      JSON.stringify(sellerIds, null, 2)
    );
  }

  let txtDias = "PERMANENTE";

  if (days && !isNaN(days)) {
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    if (!allowedUsers.includes(sellerId)) {
      allowedUsers.push(sellerId);
    }

    plans[sellerId] = {
      expiresAt: end.getTime(),
      plan: "SELLER TEMPORAL",
      days,
      addedBy: message.author.id,
      addedByName: message.author.username,
      addedAt: Date.now()
    };

    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(allowedUsers, null, 2)
    );

    fs.writeFileSync(
      PLANS_FILE,
      JSON.stringify(plans, null, 2)
    );

    txtDias = `${days} días`;
  }

  return message.reply(
    `💎 Seller agregado\n\nID ➤ ${sellerId}\n⏳ VALIDEZ ➤ ${txtDias}`
  );
}

if (command === "removeseller") {

  if (!ownerIds.includes(message.author.id)) {
    return message.reply("❌ Solo owners.");
  }

  const target =
    message.mentions.users.first() ||
    args[0];

  const sellerId =
    typeof target === "string"
      ? target
      : target.id;

  if (!sellerId) {
    return message.reply(
      "Uso: !removeseller @user"
    );
  }

  sellerIds = sellerIds.filter(
    id => id !== sellerId
  );

  fs.writeFileSync(
    SELLERS_FILE,
    JSON.stringify(sellerIds, null, 2)
  );

  return message.reply(
    `🗑️ Seller removido\n\nID ➤ ${sellerId}`
  );
}
if (command === "staff") {

  const owners = ownerIds
    .map(id => `👑 <@${id}>`)
    .join("\n") || "Ninguno";

  const sellers = sellerIds
    .map(id => `💎 <@${id}>`)
    .join("\n") || "Ninguno";

  return message.reply(`
👥 STAFF OFICIAL

👑 OWNERS
${owners}

💎 SELLERS
${sellers}
`);
}
if (command === "removeplan") {
  if (!ownerIds.includes(message.author.id)) {
    return message.reply("❌ Solo owners.");
  }

  const target =
    message.mentions.users.first() ||
    args[0];

  const targetId =
    typeof target === "string"
      ? target
      : target.id;

  if (!targetId) {
    return message.reply(
      "Uso: !removeplan @user"
    );
  }

  delete plans[targetId];

  allowedUsers =
    allowedUsers.filter(
      id => id !== targetId
    );

  fs.writeFileSync(
    PLANS_FILE,
    JSON.stringify(
      plans,
      null,
      2
    )
  );

  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(
      allowedUsers,
      null,
      2
    )
  );

  return message.reply(
`✅ PLAN ELIMINADO

USUARIO ➣ ${targetId}

EJECUTOR ➣ ${message.author.username}

❌ Acceso removido correctamente.`
  );
}
if (command === "me") {
let user =
  message.mentions.users.first();

if (!user && args[0]) {
  user =
    await discord.users
      .fetch(args[0])
      .catch(() => null);
}

if (!user) {
  user = message.author;
}

const userId = user.id;
const username = user.username;
const tag = user.tag;
const planData = plans[userId];

  let estado = "LIBRE";
  let plan = "FREE";
  let dias = "0 DÍAS";
  let vence = "NO TIENE";
  let otorgadoPor = "NO DISPONIBLE";
  let fechaRegistro = "NO DISPONIBLE";
  const banData = bans[userId];

if (banData) {
  estado = "BANEADO";
  plan = "SIN ACCESO";
  dias = "0 DÍAS";
  vence = "NO TIENE";
  otorgadoPor =
    `${banData.bannedByName} — ${banData.bannedBy}`;

  fechaRegistro =
    new Date(banData.bannedAt)
      .toLocaleString("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      });
}

  if (allowedUsers.includes(userId)) {
    estado = "ACTIVO";
    plan = planData?.plan || "PERMANENTE";

    if (planData?.addedByName && planData?.addedBy) {
      otorgadoPor =
        `${planData.addedByName} — ${planData.addedBy}`;
    }

    if (planData?.addedAt) {
      fechaRegistro =
        new Date(planData.addedAt)
          .toLocaleString(
            "es-PE",
            {
              timeZone:
                "America/Lima",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            }
          );
    }

    if (planData?.expiresAt) {
      const restante =
        planData.expiresAt -
        Date.now();

      if (restante > 0) {
        const d =
          Math.floor(
            restante /
              (1000 *
                60 *
                60 *
                24)
          );

        const h =
          Math.floor(
            restante /
              (1000 *
                60 *
                60)
          ) % 24;

        const m =
          Math.floor(
            restante /
              (1000 *
                60)
          ) % 60;

        dias =
          `${d} DÍAS, ${h} HORAS, ${m} MINUTOS`;

        vence =
          new Date(planData.expiresAt)
            .toLocaleString(
              "es-PE",
              {
                timeZone:
                  "America/Lima",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              }
            );
      } else {
        estado = "EXPIRADO";
        plan = "FREE";
      }
    } else {
      dias = "PERMANENTE";
      vence = "NUNCA";
    }
  }

  const banner =
    new AttachmentBuilder(
      "./assets/me-banner.gif"
    );

  return message.reply({
    content:
`❰ #𝐒𝐓𝐄𝐕𝐄𝐍 𝐃𝐀𝐓𝐀 ❱ ➣ PERFIL DE USUARIO

「🆔」 • ID ➣ ${userId}
「🙎」 • NOMBRE ➣ ${username}
「👨🏻‍💻」 • USUARIO ➣ ${tag}
「✅」 • ESTADO ➣ ${estado}
「👑」 • DEVELOPER ➣ Butizada

💳 SUSCRIPCIÓN

「〽️」 • ROL ➣ CLIENTE
「📈」 • PLAN ➣ ${plan}
「⏱️」 • DÍAS ➣ ${dias}
「⏳」 • VENCE ➣ ${vence}
「🎁」 • OTORGADO POR ➣ ${otorgadoPor}
「📅」 • FECHA ➣ ${fechaRegistro}`,
    files: [banner],
  });
}

if (
  plans[
    message.author.id
  ]
) {
  const userPlan =
    plans[
      message.author.id
    ];

  if (
    Date.now() >
    userPlan.expiresAt
  ) {
    allowedUsers =
      allowedUsers.filter(
        id =>
          id !==
          message.author.id
      );

    delete plans[
      message.author.id
    ];

    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(
        allowedUsers,
        null,
        2
      )
    );

    fs.writeFileSync(
      PLANS_FILE,
      JSON.stringify(
        plans,
        null,
        2
      )
    );

    return message.reply(
      "❌ Tu plan expiró."
    );
}
  if (command === "me") {

  const userId =
    message.author.id;

  const username =
    message.author.username;

  const tag =
    message.author.tag;

  const planData =
    plans[userId];

  let estado =
    "LIBRE";

  let plan =
    "FREE";

  let dias =
    "0 DÍAS";

  let vence =
    "NO TIENE";

  let otorgadoPor =
    "NO DISPONIBLE";

  let fechaRegistro =
    "NO DISPONIBLE";

  if (
    allowedUsers.includes(
      userId
    )
  ) {

    estado =
      "ACTIVO";

    plan =
      planData?.plan ||
      "PERMANENTE";

    if (
      planData?.addedByName &&
      planData?.addedBy
    ) {

      otorgadoPor =
        `${planData.addedByName} — ${planData.addedBy}`;
    }

    if (
      planData?.addedAt
    ) {

      fechaRegistro =
        new Date(
          planData.addedAt
        )
        .toLocaleString(
          "es-PE",
          {
            timeZone:
              "America/Lima",

            day:
              "2-digit",

            month:
              "2-digit",

            year:
              "numeric",

            hour:
              "2-digit",

            minute:
              "2-digit",

            second:
              "2-digit",

            hour12:
              true,
          }
        );
    }

    if (
      planData?.expiresAt
    ) {

      const restante =
        planData.expiresAt -
        Date.now();

      if (
        restante > 0
      ) {

        const d =
          Math.floor(
            restante /
            (
              1000 *
              60 *
              60 *
              24
            )
          );

        const h =
          Math.floor(
            restante /
            (
              1000 *
              60 *
              60
            )
          ) % 24;

        const m =
          Math.floor(
            restante /
            (
              1000 *
              60
            )
          ) % 60;

        dias =
          `${d} DÍAS, ${h} HORAS, ${m} MINUTOS`;

        vence =
          new Date(
            planData.expiresAt
          )
          .toLocaleString(
            "es-PE",
            {
              timeZone:
                "America/Lima",

              day:
                "2-digit",

              month:
                "2-digit",

              year:
                "numeric",

              hour:
                "2-digit",

              minute:
                "2-digit",

              second:
                "2-digit",

              hour12:
                true,
            }
          );

      } else {

        estado =
          "EXPIRADO";

        plan =
          "FREE";
      }

    } else {

      dias =
        "PERMANENTE";

      vence =
        "NUNCA";
    }
  }

  const banner =
    new AttachmentBuilder(
      "./assets/me-banner.gif"
    );

  return message.reply({
    content:
`❰ #𝐒𝐓𝐄𝐕𝐄𝐍 𝐃𝐀𝐓𝐀 ❱ ➣ PERFIL DE USUARIO

「🆔」 • ID ➣ ${userId}
「🙎」 • NOMBRE ➣ ${username}
「👨🏻‍💻」 • USUARIO ➣ ${tag}
「✅」 • ESTADO ➣ ${estado}
「👑」 • DEVELOPER ➣ Butizada

💳 SUSCRIPCIÓN

「〽️」 • ROL ➣ CLIENTE
「📈」 • PLAN ➣ ${plan}
「⏱️」 • DÍAS ➣ ${dias}
「⏳」 • VENCE ➣ ${vence}
「🎁」 • OTORGADO POR ➣ ${otorgadoPor}
「📅」 • FECHA ➣ ${fechaRegistro}`,
    files: [banner],
  });

}

}
// VERIFICAR ACCESO
if (
  !allowedUsers.includes(
    message.author.id
  )
) {
  return message.reply(
    "❌ No tienes acceso."
  );

}
   if (command === "tg") {
  queue.push(message);
  processQueue();
}
  }
);

async function processQueue() {
  if (
    busy ||
    queue.length === 0
  )
    return;

  busy = true;

  const message =
    queue.shift();

  try {
    const args =
      message.content
        .slice(
          PREFIX.length
        )
        .trim()
        .split(/ +/);

    args.shift();

    const text =
      args.join(" ");

    const attachment =
      message.attachments.first();

    if (
      !text &&
      !attachment
    ) {
      await message.reply(
        "Uso: `!tg texto` o adjunta archivo."
      );

      return;
    }

    const loading =
      await message.reply(
        "📡 Enviado Comando..."
      );

    let replies;
const blockedCommands = [
  "!addplan",
  "!removeplan",
  "!banuser",
  "!addaccess",
  "!removeaccess"
];

if (
  blockedCommands.some(cmd =>
    message.content
      .toLowerCase()
      .startsWith(cmd)
  )
) {
  return;
}
    if (attachment) {
      replies =
        await sendAttachmentToTelegram(
          attachment,
          text || ""
        );
        
    } else {
      replies =
        await sendTextToTelegram(
          text
        );
    }

    await sendTelegramBatchToDiscord(
      loading,
      replies,
      true
    );
  } catch (err) {
    console.error(err);

    await message.reply(
      "❌ No Hubo Respuesta Al Comando."
    );
  } finally {
    busy = false;

    processQueue();
  }
}

discord.on(Events.InteractionCreate, async interaction => {
  try {
    if (!interaction.isButton()) return;

    if (!interaction.customId.startsWith("tgbtn:")) {
      return;
    }

    await interaction.deferReply();

    const [, msgIdRaw, iRaw, jRaw] =
      interaction.customId.split(":");

    const msgId = Number(msgIdRaw);
    const i = Number(iRaw);
    const j = Number(jRaw);

    const beforeId =
      await getLastTelegramId();

const realMsgResult =
  await tg.getMessages(
    process.env.TG_TARGET_CHAT,
    {
      ids: msgId,
    }
  );

const realMsg = Array.isArray(realMsgResult)
  ? realMsgResult[0]
  : realMsgResult;

    if (!realMsg) {
      return interaction.editReply(
        "❌ Ese menú ya no existe."
      );
    }

    await realMsg.click({
      i,
      j,
    });

    const replies =
      await waitTelegramRepliesFromButton(
        msgId,
        beforeId
      );

    await interaction.editReply(
      "✅ Respuesta recibida."
    );

    await sendTelegramBatchToDiscord(
      {
        channel:
          interaction.channel,
      },
      replies,
      false
    );
  } catch (err) {
    console.error(err);

    if (
      interaction.deferred ||
      interaction.replied
    ) {
      await interaction.editReply(
        "❌ Falló el botón Telegram."
      );
    }
  }
});

discord.once(
  Events.ClientReady,
  () => {
    console.log(
      `✅ Discord conectado como ${discord.user.tag}`
    );
  }
);

(async () => {
  await startTelegram();

  await discord.login(
    process.env
      .DISCORD_TOKEN
  );
})();