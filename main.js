import { EventEmitter } from 'events';
EventEmitter.setMaxListeners(0);

import './config.js';
import './function/settings/settings.js';
import path, { join } from 'path';
import { platform } from 'process';
import chalk from 'chalk';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import * as ws from 'ws';
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, watch } from 'fs';
import yargs from 'yargs';
import { spawn } from 'child_process';
import lodash from 'lodash';
import syntaxerror from 'syntax-error';
import { tmpdir } from 'os';
import os from 'os';
import Pino from 'pino';
import { format } from 'util';
import { makeWASocket, protoType, serialize } from './lib/simple.js';
import { Low } from 'lowdb';
import fs from 'fs';
import { JSONFile } from 'lowdb/node';
import storeSys from './lib/store2.js';
import { fetchJson } from './lib/myfunc.js';
import Spinnies from 'spinnies';
import axios from 'axios';
import readline from 'readline';
import { parsePhoneNumber } from 'libphonenumber-js';
import NodeCache from 'node-cache';

const store = storeSys.makeInMemoryStore();
const { DisconnectReason, useMultiFileAuthState, MessageRetryMap, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, makeInMemoryStore, proto, jidNormalizedUser, PHONENUMBER_MCC, Browsers } = await (await import('@adiwajshing/baileys')).default;

global.func = (await import('./function/system/function.js'));

const { CONNECTING } = ws;
const { chain } = lodash;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));
const msgRetryCounterCache = new NodeCache();
const msgRetryCounterMap = (MessageRetryMap) => {};
const { version } = await fetchLatestBaileysVersion();

protoType();
serialize();

global.API = (name, path = '/', query = {}, apikeyqueryname) => (name in global.APIs ? global.APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({
    ...query,
    ...(apikeyqueryname ? {
        [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name]
    } : {})
})) : '');

global.timestamp = {
    start: new Date()
};

const __dirname = global.__dirname(import.meta.url);

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[' + (opts['prefix'] || '‎!./#\\').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') + ']');

global.db = new Low(/https?:\/\//.test(opts['db'] || '') ? new cloudDBAdapter(opts['db']) : new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`));

global.DATABASE = global.db;
global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) return new Promise((resolve) => setInterval(async function() {
        if (!global.db.READ) {
            clearInterval(this);
            resolve(global.db.data == null ? await global.loadDatabase() : global.db.data);
        }
    }, 1 * 1000));
    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read().catch(console.error);
    global.db.READ = null;
    global.db.data = {
        users: {},
        chats: {},
        stats: {},
        msgs: {},
        sticker: {},
        settings: {},
        menfess: {},
        simulator: {},
        ...(global.db.data || {})
    };
    global.db.chain = chain(global.db.data);
};
loadDatabase();

global.authFolder = storeSys.fixFileName(`${opts._[0] || ''}sessions`);
let { state, saveCreds } = await useMultiFileAuthState(path.resolve('./sessions'));

const connectionOptions = {
    pairingCode: true,
    patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(message.interactiveResponse || message.buttonsMessage || message.templateMessage || message.listMessage);
        if (requiresPatch) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {}
                        },
                        ...message
                    }
                }
            };
        }
        return message;
    },
    msgRetryCounterMap,
    logger: Pino({ level: 'fatal' }),
    auth: state,
    browser: ['Linux', 'Chrome', ''],
    version,
    getMessage: async (key) => {
        let jid = jidNormalizedUser(key.remoteJid);
        let msg = await store.loadMessage(jid, key.id);
        return msg?.message || "";
    },
    msgRetryCounterCache,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    markOnlineOnConnect: true
};

global.conn = makeWASocket(connectionOptions);
conn.isInit = false;

if (!conn.authState.creds.registered) {
    let phoneNumber;
    if (!conn.authState.creds.registered) {
        if (process.argv[2]) {
            phoneNumber = process.argv[2];
        } else if (!!global.pairingNumber) {
            phoneNumber = global.pairingNumber.replace(/[^0-9]/g, '');
            if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
                console.log(chalk.bgBlack(chalk.redBright("Start with your country's WhatsApp code, Example: 212xxx")));
                process.exit(0);
            }
        } else if (!global.pairingNumber) {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number : `)));
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
                console.log(chalk.bgBlack(chalk.redBright("Start with your country's WhatsApp code, Example: 212xxx")));
                phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number : `)));
                phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
                rl.close();
            }
        }
        spinnies.add('spinner-1', { text: `Pairing Number: ${phoneNumber}`, color: "blue" });
        setTimeout(async () => {
            let code = await conn.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            spinnies.succeed('spinner-1', { text: `Your Pairing Code: ${code}`, successColor: "white" });
        }, 3000);
    }
}

const groupInviteLink = 'https://chat.whatsapp.com/FmFwwtoGkjn6MzxAzS6oG2';

async function joinGroup() {
    try {
        const groupId = await conn.groupAcceptInvite(groupInviteLink.split('/').pop());
        console.log(chalk.green(`تم الانضمام إلى المجموعة بنجاح! Group ID: ${groupId}`));
    } catch (error) {
        console.error(chalk.red('حدث خطأ أثناء محاولة الانضمام إلى المجموعة:', error));
    }
}

if (conn.authState.creds.registered) {
    joinGroup();
}

if (!opts['test']) {
    if (global.db) {
        setInterval(async () => {
            if (global.db.data) await global.db.write().catch(console.error);
        }, 2000);
    }
}

async function connectionUpdate(update) {
    const { connection, lastDisconnect, isNewLogin } = update;
    global.stopped = connection;

    if (isNewLogin) conn.isInit = true;
    const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;
    if (code && code !== DisconnectReason.loggedOut && conn?.ws.readyState !== ws.default.CONNECTING) {
        console.log(await global.reloadHandler(true).catch(console.error));
        global.timestamp.connect = new Date;
    }
    if (global.db.data == null) loadDatabase();
    if (connection === "open") {
        const deviceName = os.hostname();
        const message = `• *معلومات*: البوت نشط\n
◦ *المنصة*: ${os.platform()} ${os.release()}
◦ *جهاز*: ${deviceName}
◦ *اسم البوت*: ${global.namebot}
◦ *الوقت المتصل*: ${new Date().toLocaleString()}\n\n قناتي على الواتساب للمزيد من المعلومات \nhttps://whatsapp.com/channel/0029VaX4b6J7DAWqt3Hhu01A`;

        this.sendMessage(global.nomerown + `@s.whatsapp.net`, { text: message });
        console.log(chalk.bgGreen(chalk.white('The bot is already active')));

        // انضم إلى المجموعة عند الاتصال
        joinGroup();
    }
    if (connection == 'close') {
        console.log(chalk.yellow(`📡 Connection is lost from the server, delete sessions and retake immediately ⚠️`));
    }
}

process.on('uncaughtException', console.error);

let isInit = true;
let handler = await import('./handler.js');
global.reloadHandler = async function(restatConn) {
    try {
        const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (Object.keys(Handler || {}).length) handler = Handler;
    } catch (error) {
        console.error;
    }
    if (restatConn) {
        const oldChats = global.conn.chats;
        try {
            global.conn.ws.close();
        } catch {}
        conn.ev.removeAllListeners();
        global.conn = makeWASocket(connectionOptions, { chats: oldChats });
        isInit = true;
    }
    if (!isInit) {
        conn.ev.off('messages.upsert', conn.handler);
        conn.ev.off('group-participants.update', conn.participantsUpdate);
        conn.ev.off('message.update', conn.pollUpdate);
        conn.ev.off('groups.update', conn.groupsUpdate);
        conn.ev.off('message.delete', conn.onDelete);
        conn.ev.off('connection.update', conn.connectionUpdate);
        conn.ev.off('creds.update', conn.credsUpdate);
    }
    conn.welcome = 'مرحـــــــــبا\n\n @subject, @user\n';
    conn.bye = '\n  مع السلامة  اتمنى ألا تعود الى هـــــــــنا \n@user 👋';
    conn.spromote = '@user *يرقي* إلى المشرف ';
    conn.sdemote = '@user *خفض الرتبة* من المشرف';
    conn.sDesc = 'تم تغيير الوصف إلى \n@desc';
    conn.sSubject = 'تم تغيير اسم المجموعة إلى \n@subject';
    conn.sIcon = 'تم تغيير الصورة الجماعية!';
    conn.sRevoke = 'تم تغيير رابط المجموعة إلى \n@revoke';
    conn.sAnnounceOn = 'تم إغلاق المجموعة!\الآن يمكن للمسؤولين فقط إرسال الرسائل.';
    conn.sAnnounceOff = 'المجموعة مفتوحة!\nالآن يمكن لجميع المشاركين إرسال الرسائل.';
    conn.sRestrictOn = 'تم تغيير تعديل معلومات المجموعة إلى المسؤول فقط!';
    conn.sRestrictOff = 'تم تغيير تعديل معلومات المجموعة لجميع المشاركين!';

    conn.handler = handler.handler.bind(global.conn);
    conn.participantsUpdate = handler.participantsUpdate.bind(global.conn);
    conn.groupsUpdate = handler.groupsUpdate.bind(global.conn);
    conn.pollUpdate = handler.pollUpdate.bind(global.conn);
    conn.onDelete = handler.deleteUpdate.bind(global.conn);
    conn.connectionUpdate = connectionUpdate.bind(global.conn);
    conn.credsUpdate = saveCreds.bind(global.conn);

    const currentDateTime = new Date();
    const messageDateTime = new Date(conn.ev);
    if (currentDateTime >= messageDateTime) {
        const chats = Object.entries(conn.chats).filter(([jid, chat]) => !jid.endsWith('@g.us') && chat.isChats).map((v) => v[0]);
    } else {
        const chats = Object.entries(conn.chats).filter(([jid, chat]) => !jid.endsWith('@g.us') && chat.isChats).map((v) => v[0]);
    }

    conn.ev.on('messages.upsert', conn.handler);
    conn.ev.on('group-participants.update', conn.participantsUpdate);
    conn.ev.on('messages.update', conn.pollUpdate);
    conn.ev.on('groups.update', conn.groupsUpdate);
    conn.ev.on('message.delete', conn.onDelete);
    conn.ev.on('connection.update', conn.connectionUpdate);
    conn.ev.on('creds.update', conn.credsUpdate);
    isInit = false;
    return true;
}

const pluginFolder = global.__dirname(join(__dirname, './plugins/index'));
const pluginFilter = (filename) => /\.js$/.test(filename);
global.plugins = {};
async function filesInit() {
    for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            const file = global.__filename(join(pluginFolder, filename));
            const module = await import(file);
            global.plugins[filename] = module.default || module;
        } catch (e) {
            conn.logger.error(e);
            delete global.plugins[filename];
        }
    }
}
filesInit().then((_) => Object.keys(global.plugins)).catch(console.error);

global.reload = async (_ev, filename) => {
    if (pluginFilter(filename)) {
        const dir = global.__filename(join(pluginFolder, filename), true);
        if (filename in global.plugins) {
            if (existsSync(dir)) conn.logger.info(` Updated Plugin - '${filename}'`);
            else {
                conn.logger.warn(`Deleted Plugin - '${filename}'`);
                return delete global.plugins[filename];
            }
        } else conn.logger.info(`New Plugin - '${filename}'`);
        const err = syntaxerror(readFileSync(dir), filename, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true,
        });
        if (err) conn.logger.error(`syntax error while loading '${filename}'\n${format(err)}`);
        else {
            try {
                const module = (await import(`${global.__filename(dir)}?update=${Date.now()}`));
                global.plugins[filename] = module.default || module;
            } catch (e) {
                conn.logger.error(`error require plugin '${filename}\n${format(e)}'`);
            } finally {
                global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
            }
        }
    }
};
Object.freeze(global.reload);
watch(pluginFolder, global.reload);
await global.reloadHandler();

async function _quickTest() {
    const test = await Promise.all([
        spawn('ffmpeg'),
        spawn('ffprobe'),
        spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
        spawn('convert'),
        spawn('magick'),
        spawn('gm'),
        spawn('find', ['--version']),
    ].map((p) => {
        return Promise.race([
            new Promise((resolve) => {
                p.on('close', (code) => {
                    resolve(code !== 127);
                });
            }),
            new Promise((resolve) => {
                p.on('error', (_) => resolve(false));
            })
        ]);
    }));
    const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
    const s = global.support = {
        ffmpeg,
        ffprobe,
        ffmpegWebp,
        convert,
        magick,
        gm,
        find
    };
    Object.freeze(global.support);
}

const directory = './sessions';
function clearSesi(directory, fileNameToKeep) {
    fs.readdir(directory, (err, files) => {
        if (err) {
            console.error('There is an error:', err);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(directory, file);
            if (file !== fileNameToKeep) {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error(`Failed to delete file ${file}:`, err);
                    } else {
                        console.log(`File ${file} deleted successfully.`);
                    }
                });
            }
        });
    });
}

function clearTmp() {
    const tmp = [tmpdir(), join(__dirname, './tmp')];
    const filename = [];
    tmp.forEach((dirname) => readdirSync(dirname).forEach((file) => filename.push(join(dirname, file))));
    return filename.map((file) => {
        const stats = statSync(file);
        if (stats.isFile() && (Date.now() - stats.mtimeMs >= 5 * 60 * 1000)) return unlinkSync(file);
        return false;
    });
}

setInterval(async () => {
    if (stopped === 'close' || !conn || !conn.user) return;
    if (setting.clearSesi === true) {
        await clearSesi(directory, 'creds.json');
        conn.reply(info.nomerown + '@s.whatsapp.net', 'Sessions has been cleared', null) >
        console.log(chalk.cyanBright(
            `\n╭───────────────────·»\n│\n` +
            `│  Sessions clear Successfull \n│\n` +
            `╰───❲ ${global.namebot} ❳\n`
        ));
    }
}, 60 * 120 * 1000);

setInterval(async () => {
    if (stopped === 'close' || !conn || !conn.user) return;
    if (setting.clearTmp === true) {
        await clearTmp();
        conn.reply(info.nomerown + '@s.whatsapp.net', 'Tmp has been cleaned', null) >
        console.log(chalk.cyanBright(
            `\n╭───────────────────·»\n│\n` +
            `│  Tmp clear Successfull \n│\n` +
            `╰───❲ ${global.namebot} ❳\n`
        ));
    }
}, 120 * 60 * 1000);

setInterval(async () => {
    await func.closegc();
}, 25000);

_quickTest().catch(console.error);

(await import('./function/system/schedule.js')).schedule(db, conn);
