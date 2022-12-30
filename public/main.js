
// constants
const PROTOCOL = "https://";
const BACKEND_URL = "localhost:8080";
const SOCKET_PATH = "/ws";

// utils
function debounce(func, limit = 0) {
  let last = undefined;
  return (args) => {
    if (last && (Date.now() - last) < limit) {
      log.Print('[debounce]: skip');
      return;
    }

    func(args);
    last = Date.now();
  }
}

function setUrl(url) {
  if (!url) {
    throw new Error(`[setUrl]: url arg is not defined: ${url}`);
  }

  window.history.pushState(
    {}, // non-used
    "", // legacy History API
    url
  )
}

function takeAreaName(path) {
  if (!path) {
    return "";
  }
  const parts = path.split("/");
  if (parts.length < 2) {
    return "";
  }
  return parts[1];
}

function findUserName(areaName) {
  if (!areaName) {
    return undefined;
  }

  return localStorage.getItem(areaName);
}

function bindUserToArea(area, user) {
  return localStorage.setItem(area, user);
}

function check(checkFn, trueFn, falseFn = (() => {})) {
  return (args) => checkFn() ? trueFn(args) : falseFn();
}

const log = {
  mode: 'silent', // 'warn' | 'debug'

  _isDebug() { return this.mode === 'debug'; },
  _isSilent() { return this.mode === 'silent'; },
  _isWarn() { return this.mode === 'warn'; },

  Print(message, ...args) {
    ;(
      (this._isDebug() || this._isWarn()) &&
      (console.log(message, ...args))
    );
  }
}

// messages
const LITTLE_ENDIANNE = 1;
const ENDIANNE = LITTLE_ENDIANNE;
const SIZE_PREFIX_SIZE = 2;
const TYPE_SIZE = 1;

const MOUSE_MOVE_TYPE = 2;
const COORD_SIZE = 4;

const AUTH_USER_TYPE = 1;

const USERS_ONLINE_TYPE = 3;

const AUTH_OK_TYPE = 4;

const INIT_MOUSE_COORDS_TYPE = 5;

function makeMouseMoveMessage(x, y) {
  log.Print("x, y:", x, y);

  const messageSize = (
    TYPE_SIZE +  // type
    COORD_SIZE + // x-coord
    COORD_SIZE   // y-coord
  );

  const buffer = new ArrayBuffer(SIZE_PREFIX_SIZE + messageSize);
  const dv = new DataView(buffer);

  let offset = 0;
  dv.setUint16(offset, messageSize, ENDIANNE);
  offset += SIZE_PREFIX_SIZE;

  dv.setInt8(offset, MOUSE_MOVE_TYPE, ENDIANNE);
  offset += TYPE_SIZE;

  dv.setFloat32(offset, x, ENDIANNE);
  offset += COORD_SIZE;

  dv.setFloat32(offset, y, ENDIANNE);
  offset += COORD_SIZE;

  return buffer;
}

async function makeAuthUserMessage(area, user) {
  const areaEncoded = new Blob([area], { type: "text/plain"});
  const userEncoded = new Blob([user], { type: "text/plain"});

  const areaArrayBuffer = await areaEncoded.arrayBuffer();
  const userArrayBuffer = await userEncoded.arrayBuffer();

  const typedArea = new Uint8Array(areaArrayBuffer);
  const typedUser = new Uint8Array(userArrayBuffer);

  const messageSize = (
    TYPE_SIZE        + // type
    SIZE_PREFIX_SIZE + // area size
    areaEncoded.size + // area bytes
    SIZE_PREFIX_SIZE + // user size
    userEncoded.size   // user bytes
  );

  const buffer = new ArrayBuffer(
    SIZE_PREFIX_SIZE + // total size
    messageSize
  );
  const dv = new DataView(buffer);

  // message
  let offset = 0;
  dv.setUint16(offset, messageSize, ENDIANNE);
  offset += SIZE_PREFIX_SIZE;

  log.Print("offset:", offset); // DEBUG
  dv.setInt8(offset, AUTH_USER_TYPE, ENDIANNE);
  offset += TYPE_SIZE;

  log.Print("offset:", offset); // DEBUG
  // area
  dv.setUint16(offset, areaEncoded.size, ENDIANNE);
  offset += SIZE_PREFIX_SIZE;

  log.Print("offset:", offset); // DEBUG
  for (let i = 0; i < typedArea.length; i++, offset++) {
    dv.setUint8(offset, typedArea[i], ENDIANNE);
  }

  log.Print("offset:", offset); // DEBUG
  // user
  dv.setUint16(offset, userEncoded.size, ENDIANNE);
  offset += SIZE_PREFIX_SIZE;

  log.Print("offset:", offset); // DEBUG
  for (let i = 0; i < typedUser.length; i++, offset++) {
    dv.setUint8(offset, typedUser[i], ENDIANNE);
  }

  log.Print("offset:", offset); // DEBUG
  return buffer;
}

// socket
class Socket {
  static CONNECTING = 0;

  static OPEN = 1;

  static TIMEOUT_OPEN = 2000; // ms

  constructor() {
    this.conn = null;
    this.sendGuards = []
  }

  create(addr) {
    this.conn = new WebSocket("wss://" + addr);
  }

  isReady() {
    return this.conn.readyState === Socket.OPEN;
  }

  send(message) {
    if (!this.conn) {
      throw new ReferenceError("[Socket]: connection is not created");
    }

    if (this.conn.readyState === Socket.CONNECTING) {
      log.Print('[Socket send]: still in connecting state');
    } else {
      const c = fn => fn();

      if (!this.sendGuards.some(c)) {
        this.conn.send(message);
      }
    }
  }

  pushSendGuard(fn) {
    if (typeof fn === 'function') {
      this.sendGuards.push(fn);
    }
  }

  waitOpen() {
    if (this.conn) {
      if (this.conn.readyState === Socket.OPEN) {
        return Promise.resolve();
      }

      return new Promise(resolve => (
        this.conn.addEventListener('open', resolve)
      ));
    } else {
      return Promise.reject();
    }
  }

  onOpen(callback) {
    if (this.conn) {
      this.conn.addEventListener('open', callback);
    } else {
      throw new Error("[onOpen]: conn is null");
    }
  }

  waitMessage() {
    if (this.conn) {
      return new Promise(resolve => {
        const onMessage = (event) => {
          this.conn.removeEventListener('message', onMessage);
          resolve(event);
        }
        this.conn.addEventListener('message', onMessage);
      });
    } else {
      return Promise.reject();
    }
  }

  onMessage(callback) {
    if (this.conn) {
      this.conn.addEventListener('message', callback);
    } else {
      throw new Error("[onOpen]: conn is null");
    }
  }

  onClose(callback) {
    if (this.conn) {
      this.conn.addEventListener('close', callback);
    } else {
      throw new Error("[onOpen]: conn is null");
    }
  }

  onError(callback) {
    if (this.conn) {
      this.conn.addEventListener('error', callback);
    } else {
      throw new Error("[onOpen]: conn is null");
    }
  }
}

class User {
  constructor(areaName = '', userName = '', token = '') {
    this.area = areaName;
    this.name = userName
    this.token = null;

    this.isAuthed = this.isAuthed.bind(this);
    this.isNotAuthed = this.isNotAuthed.bind(this);
  }

  isAuthed() {
    return !!(this.area && this.name && this.token);
  }

  isNotAuthed() {
    return !this.isAuthed();
  }

  setToken(token) {
    this.token = token;
  }

  define(areaName, userName) {
    ;(!this.area && (this.area = areaName));
    ;(!this.user && (this.name = userName));
  }
}

const MouseCoords = {
  x: 0,
  y: 0,
  userName: '',
};

async function messageLoop(hs, event /* another set of bytes have come... */ ) {
  let buffer = await event.data.arrayBuffer();
  const dv = new DataView(buffer);

  let offset = 0;
  let size = 0;

  while (offset <= size) {
    size = dv.getUint16(offset, ENDIANNE);
    offset += SIZE_PREFIX_SIZE;

    if (size === 0) {
      throw new Error('[messageLoop]: size is 0 =', size);
    }

    const type = dv.getInt8(offset, ENDIANNE);
    offset += TYPE_SIZE;

    const slice = buffer.slice(offset);

    switch (type) {
      case MOUSE_MOVE_TYPE:
        setTimeout(() => handleMouseMoveMessage(hs.onMouseMove, slice), 0); /* throw it in a loop */
        offset += size;
        break;
      case INIT_MOUSE_COORDS_TYPE:
        setTimeout(() => handleMouseMoveMessage(hs.onInitMouseCoords, slice), 0); /* throw it in a loop */
        offset += size;
        break;
      case AUTH_OK_TYPE:
        const message = new Blob([slice]);
        setTimeout(() => handleAuthOkMessage(hs.onAuthOk, message), 0); /* throw it in a loop */
        offset += size;
        break;
      case USERS_ONLINE_TYPE:
        setTimeout(() => handleUsersOnlineMessage(hs.onUsersOnline, slice), 0); /* throw it in a loop */
        offset += size;
        break;
      default:
        log.Print("[messageLoop]: unknown type =", type);
        return;
    }
  }
}

async function handleMouseMoveMessage(fn, buf /* ArrayBuffer */) {
  let offset = 0;
  const dv = new DataView(buf)

  let nameSize = dv.getUint16(offset, ENDIANNE);
  offset += SIZE_PREFIX_SIZE;

  if (nameSize === 0) {
    throw new Error('[handleMouseMoveMessage]: nameSize is 0 =', nameSize);
  }

  const nameBytes = new Uint8Array(buf, offset, nameSize);
  const blob = new Blob([nameBytes]);
  const name = await blob.text();
  offset += nameSize;

  const xPos = dv.getFloat32(offset,  ENDIANNE);
  offset += COORD_SIZE;

  const yPos = dv.getFloat32(offset, ENDIANNE);
  offset += COORD_SIZE;

  fn({ name, xPos, yPos });
}

async function handleAuthOkMessage(fn, message /* Blob */) {
  const text = await message.text();
  fn(text);
}

function handleUsersOnlineMessage(fn, buffer /* ArrayBuffer */) {
  log.Print("handle users online message");
  const users = [];
  fn(users)
}

function closeHandler(event) {
  ;(event.wasClean
    ? log.Print(`Closed cleanly: code=${event.code} reason=${event.reason}`)
    : log.Print("Connection died")
  );
}

function errorHandler(event) {
  log.Print("error =", event);
}

async function authUser(socket, user) {
  const authMessage = await makeAuthUserMessage(user.area, user.name);
  socket.send(authMessage);
}

/*
 * Defines protocol rules
 * TODO: convert to class Connection
 */
async function establishProtocol(socket, user) {
  // establish
  socket.create(BACKEND_URL + SOCKET_PATH);

  await socket.waitOpen();
  await authUser(socket, user);

  socket.pushSendGuard(user.isNotAuthed)

  // run
  if (socket.isReady()) {
    log.Print("socket is running..."); // DEBUG

    const handlers = {
      onAuthOk: (text) => { ;(text === "ok" && user.setToken(text)); },
      onMouseMove: (message) => { log.Print("[onMouseMove]: message =", message); },
      onInitMouseCoords: (message) => { log.Print("[onInitMouseCoords]: message =", message); },
      onUsersOnline: (users) => { log.Print("[onUsersOnline]: users =", users); },
    };

    socket.onMessage((event) => messageLoop(handlers, event));
    socket.onClose(closeHandler);
    socket.onError(errorHandler);

    trackMouseEvents(socket);
  } else {
    throw new Error("[init]: failed to open socket");
  }
}

function trackMouseEvents(s /* socket */) {
  document.addEventListener(
    'mousemove',
    debounce((event) => {
      s.send(makeMouseMoveMessage(event.clientX, event.clientY));
    }),
  );
}

// requests
async function proceedNewArea() {
  const response = await fetch(PROTOCOL + BACKEND_URL + "/area/new");
  if (!response.ok) {
    throw new Error("[proceedNewArea]: failed to create new area");
  }

  try {
    const areaName = await response.text();
    if (!areaName) {
      throw new Error("[proceedNewArea]: empty area name");
    }

    log.Print('areaName:', areaName); // DEBUG
    setUrl(`/${areaName}`);

    return areaName;
  } catch (e) {
    log.Print("error occured while retrieving response body text");
    console.error(e);
  }
}

async function proceedNewUser(areaName) {
  const response = await fetch(PROTOCOL + BACKEND_URL + "/join", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    },
    body: areaName
  });
  if (!response.ok) {
    throw new Error("[proceedNewUser]: failed to create new user");
  }

  try {
    const userName = await response.text();
    if (!userName) {
      throw new Error("[proceedNewUser]: empty user name");
    }

    log.Print("userName:", userName); // DEBUG
    bindUserToArea(areaName, userName);

    return userName;
  } catch (e) {
    log.Print("error occured while retrieving response body text");
    throw new Error(e);
  }
}

async function listUsersOnline(areaName) {
  const response = await fetch(PROTOCOL + BACKEND_URL + `/area/${areaName}`);
  if (!response.ok) {
    throw new Error("[restoreSession]: failed to list users");
  }

  try {
    const users = await response.text();
    log.Print("users: ", users);
  } catch (e) {
    throw new Error(e);
  }
}

async function restoreSession(areaName, userName) {
  log.Print("areaName, userName", areaName, userName); // DEBUG
  await new Promise(resolve => resolve());
}

async function main() {
  log.mode = 'debug';

  const socket = new Socket();
  const user = new User();

  let userName;

  let areaName = takeAreaName(window.location.pathname);
  if (!areaName) {
    areaName = await proceedNewArea();
    userName = await proceedNewUser(areaName);

    user.define(areaName, userName);

    await establishProtocol(socket, user);

    return;
  }

  userName = findUserName(areaName);
  if (!userName) {
    userName = await proceedNewUser(areaName)

    user.define(areaName, userName);

    await establishProtocol(socket, user);

    return;
  }

  user.define(areaName, userName);

  await establishProtocol(socket, user);
  await restoreSession(areaName, userName);
}

async function init() {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw ReferenceError("[init]: no #root");
  }

  if (!window['WebSocket']) {
    console.error("[init]: browser does not support WebSockets");
    return;
  }

  main();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
