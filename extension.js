/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as WM from 'resource:///org/gnome/shell/ui/windowManager.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const WINDOW_ANIMATION_TIME = 250;

export default class DragnTileExtension extends Extension {
    enable() {
        this._dragMonitor = {
            dragDrop: this._onDragDrop.bind(this),
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        this._tileTip = null;
        this._quadrant = -1;
        this._tile = 'none';
        this._nextTile = 'none';

        this._source = undefined;
        this._target = undefined;

        // Create a new GSettings object
        this._settings = this.getSettings();
        this._debug = this._settings.get_value('debug');

        // Watch for changes to a specific setting
        this._settings.connect('changed::debug', (settings, key) => {
            this._debug = settings.get_value(key);
            console.log('DragnTileExtension.settings', `${key} = ${settings.get_value(key).print(true)}`);
        });
    }

    disable() {
        DND.removeDragMonitor(this._dragMonitor);
        this._settings = null;
    }

    _onDragDrop(event) {
        if (this._tileTip) {
            this._tileTip.hide();
            this._nextTile = 'none';
        }

        // let id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        // });
        // GLib.Source.set_name_by_id(id, '[gnome-shell] extension.dragNtile');

        if (this._target instanceof WindowPreview && this._source instanceof WindowPreview) {
            if (this._debug.get_boolean())
                console.log('DragnTileExtension.upon-app ', this._source.get_name(), ' on ', this._target.get_name());

            let monitor = this._target.metaWindow.get_monitor();
            let workspace = this._target.metaWindow.get_workspace();
            let monitorWorkArea = workspace.get_work_area_for_monitor(monitor);

            console.log('monitorWorkArea', monitorWorkArea.x, monitorWorkArea.y, monitorWorkArea.width, monitorWorkArea.height);

            if (this._tile == 'SLTR') {
                // source | target
                this._target._activate();
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._target.metaWindow.move_resize_frame(false, monitorWorkArea.x + monitorWorkArea.width/2, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);

                this._source._activate();
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._source.metaWindow.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);
            } else if (this._tile == 'TLSR') {
                // target | source
                this._target._activate();
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._target.metaWindow.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);

                this._source._activate();
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._source.metaWindow.move_resize_frame(false, monitorWorkArea.x + monitorWorkArea.width/2, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);
            } else if (this._tile == 'STTB') {
                this._target._activate();
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._target.metaWindow.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y + monitorWorkArea.height/2, monitorWorkArea.width, monitorWorkArea.height/2);

                this._source._activate();
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._source.metaWindow.move_resize_frame(false, 0, 0, monitorWorkArea.width, monitorWorkArea.height/2);
            } else if (this._tile == 'TTSB') {
                this._target._activate();
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._target.metaWindow.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y, monitorWorkArea.width, monitorWorkArea.height/2);

                this._source._activate();
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._source.metaWindow.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y + monitorWorkArea.height/2, monitorWorkArea.width, monitorWorkArea.height/2);
            }

            // release window resource
            this._source = undefined;
            this._target = undefined;
        }

        return DND.DragDropResult.CONTINUE;
    }

    _onDragMotion(event) {
        let source = event.source;
        // if drag point intersects any WindowPreview
        let {quad: quadrant, preview: windowpreview} = this._getQuadrant(source._workspace, event);
        if (this._quadrant == -1 && quadrant == 0) {
            this._nextTile = 'SLTR';                         // source left target right
        } else if (this._quadrant == -1 && quadrant == 1) {
            this._nextTile = 'TLSR';
        } else if (this._quadrant == -1 && quadrant == 2) {
            this._nextTile = 'TLSR';
        } else if (this._quadrant == -1 && quadrant == 3) {
            this._nextTile = 'SLTR';
        } else if (this._quadrant == 0 && quadrant == 1) {
            this._nextTile = 'TLSR';
        } else if (this._quadrant == 1 && quadrant == 2) {
            this._nextTile = 'TTSB';                         // target top source bottom
        } else if (this._quadrant == 2 && quadrant == 3) {
            this._nextTile = 'SLTR';
        } else if (this._quadrant == 3 && quadrant == 0) {
            this._nextTile = 'STTB';
        } else if (this._quadrant == 0 && quadrant == 3) {
            this._nextTile = 'TTSB';
        } else if (this._quadrant == 3 && quadrant == 2) {
            this._nextTile = 'TLSR';
        } else if (this._quadrant == 2 && quadrant == 1) {
            this._nextTile = 'STTB';
        } else if (this._quadrant == 1 && quadrant == 0) {
            this._nextTile = 'SLTR';
        } else if (this._quadrant != quadrant) {
            this._nextTile = 'none';
        }
        this._quadrant = quadrant;

        if (this._nextTile != 'none') {
            this._source = source;
            this._target = windowpreview;
        } else {
            this._tile = this._nextTile;
            this._tileTip?.hide();
        }
        if (this._debug.get_boolean())
            console.log('DragnTileExtension.drag', source.get_name(),
                ', point', event.x, event.y, ', quadrant', quadrant,
                ', Preview', windowpreview?.get_name(),
                ', tilemode', this._nextTile);


        if (this._nextTile !== this._tile) {
            // Here tileTip is on top of target preview. Hide it first to
            // let drag event pass in a target preview window.
            this._tileTip?.hide();

            let target = event.targetActor;
            let dstBound = undefined;
            const topleft = new Graphene.Point3D({x: 0, y: 0});
            const rightbottom = new Graphene.Point3D({x: target.get_width(), y: target.get_height()});
            // translate to screen coordinate
            let {x: left, y: top} = target.apply_transform_to_point(topleft);
            let {x: right, y: bottom} = target.apply_transform_to_point(rightbottom);

            if (this._nextTile == 'SLTR') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top,
                    width: (right - left) / 2,
                    height: (bottom - top)});
            } else if (this._nextTile == 'TLSR') {
                dstBound = new Mtk.Rectangle({
                    x: left + (right - left) / 2,
                    y: top,
                    width: (right - left) / 2,
                    height: (bottom - top)});
            } else if (this._nextTile == 'STTB') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top,
                    width: (right - left),
                    height: (bottom - top) / 2});
            } else if (this._nextTile == 'TTSB') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top + (bottom - top) / 2,
                    width: (right - left),
                    height: (bottom - top) / 2});
            }

            if (this._debug.get_boolean())
                console.log('DragnTileExtension.drag: dst', dstBound.x, dstBound.y, dstBound.width, dstBound.height);

            while (target) {
                if (target instanceof WindowPreview) {
                    if (this._tileTip) {
                        this._tileTip.hide();
                    }
                    this._tileTip = new St.Widget({
                        name: 'DragnTileTip',
                        style_class: 'tile-preview',
                        x: left,
                        y: top,
                        width: right - left,
                        height: bottom - top,
                        opacity: 0,
                    });

                    Main.uiGroup.add_child(this._tileTip);
                    Main.uiGroup.set_child_above_sibling(this._tileTip, null);
                    // put dnd on top of tileTip
                    if (source._draggable && source._draggable._dragActor) {
                        Main.uiGroup.set_child_above_sibling(source._draggable._dragActor, null);
                    }

                    this._tileTip.show();
                    this._tileTip.ease({
                        x: dstBound.x,
                        y: dstBound.y,
                        width: dstBound.width,
                        height: dstBound.height,
                        opacity: 255,
                        duration: WINDOW_ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                    console.log('DragnTileExtension.drag tiletip bounds', dstBound.x, dstBound.y, dstBound.width, dstBound.height);

                    this._tile = this._nextTile;
                    break;
                }
                target = target.get_parent();
            }
        }

        // always listen dragmotion event
        return DND.DragDropResult.CONTINUE;
    }

    _getQuadrant(workspace, event) {
        let source = event.source;
        let ret = {quad: -1, preview: undefined};
        // TODO: maybe peek actors at point?
        for (const window of workspace._windows) {
            if (window instanceof WindowPreview && window !== source) {
                const topleft = new Graphene.Point3D({x: 0, y: 0});
                const rightbottom = new Graphene.Point3D({x: window.get_width(), y: window.get_height()});
                // translate to screen coordinate
                let {x: left, y: top} = window.apply_transform_to_point(topleft);
                let {x: right, y: bottom} = window.apply_transform_to_point(rightbottom);

                if (event.x > left && event.x < (left + right) / 2 && event.y > top && event.y < (top + bottom) / 2) {
                    ret = {quad: 0, preview: window};
                } else if (event.x > (left + right) / 2 && event.x < right && event.y > top && event.y < (top + bottom) / 2) {
                    ret = {quad: 1, preview: window};
                } else if (event.x > (left + right) / 2 && event.x < right && event.y > (top + bottom) / 2 && event.y < bottom) {
                    ret = {quad: 2, preview: window};
                } else if (event.x > left && event.x < (left + right) / 2 && event.y > (top + bottom) / 2 && event.y < bottom) {
                    ret = {quad: 3, preview: window};
                }

                if (ret.quad != -1) {
                    break;
                }
            }
        }
        return ret;
    }
}
