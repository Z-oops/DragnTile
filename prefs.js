import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DragnTilePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Create a preferences page, with a single group
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('General'),
            description: _('General settings of DragnTile'),
        });
        page.add(group);

        const spin = new Adw.SpinRow({
            title: _('Gap'),
            subtitle: _('Tiling window gaps in pixel (0~40)'),
        });
        spin.set_adjustment(new Gtk.Adjustment({
            lower: 0,
            upper: 40,
            step_increment: 1,
            value: 2,
        }));
        group.add(spin);

        const aroundRow = new Adw.SwitchRow({
            title: _('Add gap around windows'),
            subtitle: _('Apply gap to window edges'),
        });
        group.add(aroundRow);

        const useTilingPreview = new Adw.SwitchRow({
            title: _('Tiling preview'),
            subtitle: _('Show tiling preview in overview (experimental)'),
        });
        group.add(useTilingPreview);

        const row = new Adw.SwitchRow({
            title: _('debug'),
            subtitle: _('Enable debug log'),
        });
        group.add(row);

        // Create a settings object and bind the row to the `show-indicator` key
        window._settings = this.getSettings();
        window._settings.bind('window-gap', spin, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind('around', aroundRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind('tiling-preview', useTilingPreview, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind('debug', row, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}
