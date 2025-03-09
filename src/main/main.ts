/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { startRelay, trimAddresses, Libp2pType } from 'libp2p-relay-ts';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

const useUpdater = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
let Node: Libp2pType;
const Main = () => {
  // eslint-disable-next-line promise/catch-or-return
  startRelay()
    .then((_node) => {
      console.log(
        'Relay Node started with addresses:',
        trimAddresses(_node.getMultiaddrs()),
      );
      // eslint-disable-next-line no-lone-blocks
      {
        process.on('SIGTERM', async () => {
          await _node.stop();
          process.exit(0);
        });
        process.on('SIGINT', async () => {
          await _node.stop();
          process.exit(0);
        });
        process.on('exit', async () => {
          await _node.stop();
          process.exit(0);
        });
        process.on('uncaughtException', async (err) => {
          console.error('Uncaught Exception:', err);
          await _node.stop();
          process.exit(1);
        });
        process.on('unhandledRejection', async (reason) => {
          console.error('Unhandled Rejection:', reason);
          await _node.stop();
          process.exit(1);
        });
        process.on('beforeExit', async (code) => {
          console.log('Process beforeExit with code:', code);
          await _node.stop();
          process.exit(code);
        });
        process.on('exit', async (code) => {
          console.log('Process exit with code:', code);
          await _node.stop();
          process.exit(code);
        });
        process.on('SIGUSR2', async () => {
          console.log('SIGUSR2 received');
          await _node.stop();
          process.exit(0);
        });
        process.on('SIGUSR1', async () => {
          console.log('SIGUSR1 received');
          await _node.stop();
          process.exit(0);
        });
        process.on('SIGHUP', async () => {
          console.log('SIGHUP received');
          await _node.stop();
          process.exit(0);
        });
        process.on('SIGQUIT', async () => {
          console.log('SIGQUIT received');
          await _node.stop();
          process.exit(0);
        });
      }
      Node = _node;
    })
    .catch((err) => {
      console.error('Error starting relay:', err);
    })
    .finally(() => {
      // console.log('Good Test 1', Node?.getMultiaddrs());
    });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ipcMain.on('ipc-update', async (event, arg) => {
    // const msgTemplate = (pingPong: string) => `Relay stats: ${pingPong}`;
    // console.log(msgTemplate(arg));
    while (Node !== null) {
      // const randomWait = Math.floor(Math.random() * 5000) + 1000; // Random wait between 1 and 6 seconds
      // eslint-disable-next-line no-use-before-define
      event.reply('ipc-update', JSON.stringify(update()));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 4000);
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
  }

  const isDebug =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

  if (isDebug) {
    require('electron-debug')();
  }

  const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
      .default(
        extensions.map((name) => installer[name]),
        forceDownload,
      )
      .catch(console.log);
  };

  const createWindow = async () => {
    if (isDebug) {
      await installExtensions();
    }

    const RESOURCES_PATH = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
      return path.join(RESOURCES_PATH, ...paths);
    };

    mainWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 728,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    mainWindow.loadURL(resolveHtmlPath('index.html'));

    mainWindow.on('ready-to-show', () => {
      if (!mainWindow) {
        throw new Error('"mainWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        mainWindow.minimize();
      } else {
        mainWindow.show();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    mainWindow.webContents.setWindowOpenHandler((edata) => {
      shell.openExternal(edata.url);
      return { action: 'deny' };
    });

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    if (useUpdater) new AppUpdater();
  };

  /**
   * Add event listeners...
   */

  app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app
    .whenReady()
    .then(() => {
      createWindow();
      app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) createWindow();
      });
    })
    .catch(console.log);
};
Main();
function update() {
  if (!Node) {
    return {
      error: 'Node is not initialized',
    };
  }

  return {
    addresses: trimAddresses(Node.getMultiaddrs()),
    peers: Node.getPeers().map((peer) => peer.toString()),
    protocols: Node.getProtocols(),
    connections: Node.getConnections().map((conn) => ({
      peer: conn.remotePeer.toString(),
    })),
  };
}
