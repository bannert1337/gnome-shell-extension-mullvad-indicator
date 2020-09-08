const {GObject, Gio} = imports.gi;
const Gettext = imports.gettext;
const Mainloop = imports.mainloop;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Mullvad = Me.imports.mullvad;
const Settings = Me.imports.settings;

const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;

Gettext.bindtextdomain('mullvadindicator', Me.dir.get_child('locale').get_path());
Gettext.textdomain('mullvadindicator');
const _ = Gettext.gettext;

const ICON_CONNECTED = 'mullvad-connected-symbolic';
const ICON_DISCONNECTED = 'mullvad-disconnected-symbolic';

const STATUS_STARTING = _('Initializing');
const STATUS_CONNECTED = _('Connected');
const STATUS_DISCONNECTED = _('Disconnected');

const MullvadIndicator = GObject.registerClass({
    GTypeName: 'MullvadIndicator',
}, class MullvadIndicator extends PanelMenu.SystemIndicator {

    _init() {
        super._init(0);

        this._mullvad = new Mullvad.MullvadVPN();
        this._initGui();

        this._watch = this._mullvad.connect('status-changed', _mullvad => {
            this._update();
        });

        this._main();
    }

    _initGui() {
        // Add the indicator to the indicator bar
        this._indicator = this._addIndicator();
        this._indicator.visible = false;

        // Build a menu

        // Main item with the header section
        this._item = new PopupMenu.PopupSubMenuMenuItem(STATUS_STARTING, true);
        this._item.icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/mullvad-disconnected-symbolic.svg`);
        this._item.label.clutter_text.x_expand = true;
        this.menu.addMenuItem(this._item);

        // Content Inside the box
        this._item.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Add icon to system tray at position 0
        AggregateMenu._indicators.insert_child_at_index(this, 0);

        // Add dropdown menu below the network index.
        // This is a pretty hacky solution, thanks to @andyholmes on
        // #extensions:gnome.org for helping me with this.
        let menuItems = AggregateMenu.menu._getMenuItems();
        let networkMenuIndex = menuItems.indexOf(AggregateMenu._network.menu) || 3;
        AggregateMenu.menu.addMenuItem(this.menu, networkMenuIndex + 1);

        this._buildBottomMenu();

        this._update();
    }

    _update() {
        // Destroy and recreate our inner menu
        this._item.destroy();

        // Update systray icon first
        let icon = this._mullvad.connected ? ICON_CONNECTED : ICON_DISCONNECTED;
        this._indicator.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${icon}.svg`);
        this._indicator.visible = true;

        // Main item with the header section
        this._item = new PopupMenu.PopupSubMenuMenuItem(STATUS_STARTING, true);
        this._item.icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${icon}.svg`);
        this._item.label.clutter_text.x_expand = true;
        this.menu.addMenuItem(this._item);

        this._item.label.text = this._mullvad.connected ? STATUS_CONNECTED : STATUS_DISCONNECTED;

        // Content Inside the box
        this._item.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Add elements to the UI
        AggregateMenu.menu.addMenuItem(this.menu, 4);

        let detailedStatus = this._mullvad.detailed_status;
        for (let item in detailedStatus) {
            let title = detailedStatus[item].name;
            let body = detailedStatus[item].text;
            // Don't add menu items for undefined values
            if (body) {
                let statusText = `${title}: ${body}`;
                let menuItem = new PopupMenu.PopupMenuItem(statusText);
                this._disconnectAction = this._item.menu.addMenuItem(menuItem);
            }
        }

        this._buildBottomMenu();
    }

    _buildBottomMenu() {
        // Refresh menu item
        let refreshItem = new PopupMenu.PopupMenuItem(_('Refresh'));
        refreshItem.actor.connect('button-press-event', () => {
            this._mullvad._pollMullvad();
        });
        this._item.menu.addMenuItem(refreshItem);

        // Settings menu item
        let settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.actor.connect('button-press-event', () => {
            Util.spawnCommandLine('gnome-extensions prefs mullvadindicator@pobega.github.com');
        });
        this._item.menu.addMenuItem(settingsItem);
    }

    _main() {
        this._mullvad._pollMullvad();
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
        const refreshTime = Settings._getSettings().get_int('refresh-time');
        this._timeout = Mainloop.timeout_add_seconds(refreshTime, function () {
            this._main();
        }.bind(this));
    }

    _stop() {
        // Disconnect signals
        this._mullvad.disconnect(this._watch);

        // Kill our mainloop when we shut down
        if (this._timeout)
            Mainloop.source_remove(this._timeout);
        this._timeout = undefined;
    }
});

function init() {
}

let _mullvadIndicator;

function enable() {
    _mullvadIndicator = new MullvadIndicator();
}

function disable() {
    // Kill our status indicator
    _mullvadIndicator._stop();
    _mullvadIndicator._item.destroy();
    _mullvadIndicator.destroy();
    _mullvadIndicator = null;
}
