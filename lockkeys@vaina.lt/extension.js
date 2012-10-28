const St = imports.gi.St;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const _ = Gettext.gettext;

const Panel = imports.ui.panel;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;

const Keymap = Gdk.Keymap.get_default();
const Caribou = imports.gi.Caribou;

const ExtensionUtils = imports.misc.extensionUtils;
const Meta = ExtensionUtils.getCurrentExtension();
const Utils = Meta.imports.utils;

//GS 3.4 and 3.6 compatibility
const StatusArea = Main.panel.statusArea ? Main.panel.statusArea : Main.panel._statusArea;
const MenuManager = Main.panel.menuManager ? Main.panel.menuManager : Main.panel._menus;
const RightBox = Main.panel._rightBox;


const STYLE = 'style';
const STYLE_NUMLOCK = 'numlock';
const STYLE_CAPSLOCK = 'capslock';
const STYLE_BOTH = 'both';
const NOTIFICATIONS = 'notifications';

let indicator;

function main() {
	init();
	enable();
}

function init() {
}

function enable() {
	indicator = new LockKeysIndicator();
	
	//this approach does not work on GS 3.6
	indicator.actor.reparent(RightBox);
	RightBox.remove_actor(indicator.actor);
	RightBox.insert_child_at_index(indicator.actor,  _getPreferredIndex());

	MenuManager.addMenu(indicator.menu);
	indicator.setActive(true);
}

function disable() {
	indicator.setActive(false);
	MenuManager.removeMenu(indicator.menu);
	RightBox.remove_actor(indicator.actor);
}

function _getPreferredIndex() {
	//just before xkb layout indicator
	if (StatusArea['keyboard']) {
		let xkb = StatusArea['keyboard'];
		
		let i;
		let children = RightBox.get_children();
		for (i = children.length - 1; i >= 0; i--) {
			if(xkb == children[i]._delegate){
				return i;
			}
		}
	}
	return 0;
}


function LockKeysIndicator() {
	this._init();
}

LockKeysIndicator.prototype = {
	__proto__: PanelMenu.Button.prototype,

	_init: function() {
		PanelMenu.Button.prototype._init.call(this, St.Align.START);

		// For highlight to work properly you have to use themed
		// icons. Fortunately we can add our directory to the search path.
		Gtk.IconTheme.get_default().append_search_path(Meta.dir.get_child('icons').get_path());

		this.numIcon = new St.Icon({icon_name: "numlock-enabled-symbolic",
			style_class: 'system-status-icon'});
		this.capsIcon = new St.Icon({icon_name: "capslock-enabled-symbolic",
			style_class: 'system-status-icon'});

		this.layoutManager = new St.BoxLayout({vertical: false,
			style_class: 'lockkeys-container'});
		this.layoutManager.add(this.numIcon);
		this.layoutManager.add(this.capsIcon);

		this.actor.add_actor(this.layoutManager);

		this.numMenuItem = new PopupMenu.PopupSwitchMenuItem(_('Num Lock'), false, { reactive: true });
		this.numMenuItem.connect('toggled', Lang.bind(this, this._handleNumlockMenuItem));
		this.menu.addMenuItem(this.numMenuItem);

		this.capsMenuItem = new PopupMenu.PopupSwitchMenuItem(_('Caps Lock'), false, { reactive: true });
		this.capsMenuItem.connect('toggled', Lang.bind(this, this._handleCapslockMenuItem));
		this.menu.addMenuItem(this.capsMenuItem);

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this.settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
		this.settingsMenuItem.connect('activate', Lang.bind(this, this._handleSettingsMenuItem));
		this.menu.addMenuItem(this.settingsMenuItem);
		
		this.settings = Utils.getSettings(Meta);
		this._handleSettingsChange();
		this._updateState();
	},

	setActive: function(enabled) {
		if (enabled) {
			this._keyboardStateChangedId = Keymap.connect('state-changed', Lang.bind(this, this._handleStateChange));
			this._settingsChangeId = this.settings.connect("changed::" + STYLE, Lang.bind(this, this._handleSettingsChange));
			this._handleSettingsChange();
			this._updateState();
		} else {
			Keymap.disconnect(this._keyboardStateChangedId);
			this.settings.disconnect(this._settingsChangeId);
		}
	}, 

	_handleSettingsMenuItem: function(actor, event) {
		imports.misc.util.spawn(['gnome-shell-extension-prefs', 'lockkeys@vaina.lt']);
	},
	
	_isShowNotifications: function() {
		return this.settings.get_boolean(NOTIFICATIONS);
	},
	
	_isShowNumLock: function() {
		let widget_style = this.settings.get_string(STYLE);
		return widget_style == STYLE_NUMLOCK || widget_style == STYLE_BOTH; 
	},
	
	_isShowCapsLock: function() {
		let widget_style = this.settings.get_string(STYLE);
		return widget_style == STYLE_CAPSLOCK || widget_style == STYLE_BOTH; 
	},
	
	_handleSettingsChange: function(actor, event) {
		if (this._isShowNumLock())
			this.numIcon.show();
		else
			this.numIcon.hide();
		
		if (this._isShowCapsLock())
			this.capsIcon.show();
		else
			this.capsIcon.hide();
	},
	
	_handleNumlockMenuItem: function(actor, event) {
		keyval = Gdk.keyval_from_name("Num_Lock");
		Caribou.XAdapter.get_default().keyval_press(keyval);
		Caribou.XAdapter.get_default().keyval_release(keyval);
	}, 

	_handleCapslockMenuItem: function(actor, event) {
		keyval = Gdk.keyval_from_name("Caps_Lock");
		Caribou.XAdapter.get_default().keyval_press(keyval);
		Caribou.XAdapter.get_default().keyval_release(keyval);
	},

	_handleStateChange: function(actor, event) {
		if (this.numlock_state != this._getNumlockState()) {
			let notification_text = _('Num Lock') + ' ' + this._getStateText(this._getNumlockState());
			if (this._isShowNotifications() && this._isShowNumLock()) {
				this._showNotification(notification_text, "numlock-enabled");
			}
		}
		if (this.capslock_state != this._getCapslockState()) {
			let notification_text = _('Caps Lock') + ' ' + this._getStateText(this._getCapslockState());
			if (this._isShowNotifications() && this._isShowCapsLock()) {
				this._showNotification(notification_text, "capslock-enabled");
			}
		}
		this._updateState();
	},

	_updateState: function() {
		this.numlock_state = this._getNumlockState();
		this.capslock_state = this._getCapslockState();

		if (this.numlock_state)
			this.numIcon.set_icon_name("numlock-enabled-symbolic");
		else
			this.numIcon.set_icon_name("numlock-disabled-symbolic");

		if (this.capslock_state)
			this.capsIcon.set_icon_name("capslock-enabled-symbolic");
		else
			this.capsIcon.set_icon_name("capslock-disabled-symbolic");
			
		this.numMenuItem.setToggleState( this.numlock_state );
		this.capsMenuItem.setToggleState( this.capslock_state );
	},

	_showNotification: function(notification_text, icon_name) {
		this._prepareSource(icon_name);

		let notification = null;
		if (this._source.notifications.length == 0) {
			notification = new MessageTray.Notification(this._source, notification_text);
			notification.setTransient(true);
			notification.setResident(false);
		} else {
			notification = this._source.notifications[0];
			notification.update(notification_text, null, { clear: true });
		}

		this._source.notify(notification);
	},

	_prepareSource: function(icon_name) {
		if (this._source == null) {
			this._source = new MessageTray.SystemNotificationSource();
			this._source.createNotificationIcon = function() {
				return new St.Icon({ icon_name: icon_name,
					icon_type: St.IconType.SYMBOLIC,
					icon_size: this.ICON_SIZE });
			};
			this._source.connect('destroy', Lang.bind(this,
					function() {
				this._source = null;
			}));
			Main.messageTray.add(this._source);
		}
	},

	_getStateText: function(state) {
		return state ? _('On') : _('Off');
	},

	_getNumlockState: function() {
		return Keymap.get_num_lock_state();
	},

	_getCapslockState: function() {
		return Keymap.get_caps_lock_state();
	}
}
