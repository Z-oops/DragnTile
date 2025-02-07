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
        this._showingTip = false;
        this._quadant = -1;

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
        if (this._showingTip && this._tileTip) {
            this._tileTip.hide();
            this._showingTip = false;
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

            if (this._quadrant == 0 || this._quadrant == 3) {
                // source | target
                this._target._activate();
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._target.metaWindow.move_resize_frame(false, monitorWorkArea.width/2, 0, monitorWorkArea.width/2, monitorWorkArea.height);

                this._source._activate();
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._source.metaWindow.move_resize_frame(false, 0, 0, monitorWorkArea.width/2, monitorWorkArea.height);
            } else if (this._quadrant == 1 || this._quadrant == 2) {
                // target | source
                this._target._activate();
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._target.metaWindow.move_resize_frame(false, 0, 0, monitorWorkArea.width/2, monitorWorkArea.height);

                this._source._activate();
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                this._source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                this._source.metaWindow.move_resize_frame(false, monitorWorkArea.width/2, 0, monitorWorkArea.width/2, monitorWorkArea.height);
            }

            this._quadrant = -1;
            // release window resource
            this._source = undefined;
            this._target = undefined;
        }

        return DND.DragDropResult.CONTINUE;
    }

    _onDragMotion(event) {
        let source = event.source;
        // if drag point intersects any WindowPreview
        // TODO: maybe peek actors at point?
        let quadrant = -1;
        for (const window of source._workspace._windows) {
            if (window instanceof WindowPreview && window !== source) {
                const topleft = new Graphene.Point3D({x: 0, y: 0});
                const rightbottom = new Graphene.Point3D({x: window.get_width(), y: window.get_height()});
                // translate to screen coordinate
                let {x: left, y: top} = window.apply_transform_to_point(topleft);
                let {x: right, y: bottom} = window.apply_transform_to_point(rightbottom);
                quadrant = this._getQuadrant({x1: left, y1: top, x2: right, y2: bottom}, {x: event.x, y: event.y});
                if (this._debug.get_boolean())
                    console.log('DragnTileExtension.drag', source.get_name(),
                        ', point', event.x, event.y, ', quadrant', quadrant,
                        ', previewWindow', window.get_name(), left, top, right, bottom);

                if (quadrant != -1) {
                    this._source = source;
                    this._target = window;

                    break;
                }
            }

        }

        if (this._debug.get_boolean())
            console.log('DragnTileExtension.drag quadrant', this._quadrant, quadrant);
        if (this._quadrant != quadrant) {
            this._quadrant = quadrant;
            if (this._quadrant != -1) {
                let target = event.targetActor;
                let dstBound = undefined;
                const topleft = new Graphene.Point3D({x: 0, y: 0});
                const rightbottom = new Graphene.Point3D({x: target.get_width(), y: target.get_height()});
                // translate to screen coordinate
                let {x: left, y: top} = target.apply_transform_to_point(topleft);
                let {x: right, y: bottom} = target.apply_transform_to_point(rightbottom);

                if (this._quadrant == 0 || this._quadrant == 3) {
                    dstBound = new Mtk.Rectangle({
                        x: left,
                        y: top,
                        width: (right - left) / 2,
                        height: (bottom - top)});
                }
                if (this._quadrant == 1 || this._quadrant == 2) {
                    dstBound = new Mtk.Rectangle({
                        x: left + (right - left) / 2,
                        y: top,
                        width: (right - left) / 2,
                        height: (bottom - top)});
                }
                if (this._debug.get_boolean())
                    console.log('DragnTileExtension.drag: dst', dstBound.x, dstBound.y, dstBound.width, dstBound.height);

                while (target) {
                    if (target instanceof WindowPreview && target !== source) {
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

                        this._showingTip = true;
                        break;
                    }
                    target = target.get_parent();
                }
            }
        }

        if (this._quadrant == -1 && this._showingTip) {
            this._tileTip.hide();
            this._showingTip = false;
        }

        // always listen dragmotion event
        return DND.DragDropResult.CONTINUE;
    }

    _getQuadrant(rect, point) {
        if (point.x > rect.x1 && point.x < (rect.x1 + rect.x2) / 2 && point.y > rect.y1 && point.y < (rect.y1 + rect.y2) / 2) {
            return 0;
        } else if (point.x > (rect.x1 + rect.x2) / 2 && point.x < rect.x2 && point.y > rect.y1 && point.y < (rect.y1 + rect.y2) / 2) {
            return 1;
        } else if (point.x > (rect.x1 + rect.x2) / 2 && point.x < rect.x2 && point.y > (rect.y1 + rect.y2) / 2 && point.y < rect.y2) {
            return 2;
        } else if (point.x > rect.x1 && point.x < (rect.x1 + rect.x2) / 2 && point.y > (rect.y1 + rect.y2) / 2 && point.y < rect.y2) {
            return 3
        } else {
            return -1;
        }
    }
}
