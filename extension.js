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
    }

    disable() {
        DND.removeDragMonitor(this._dragMonitor);
    }

    _onDragDrop(event) {
        console.error('DragnTileExtension._onDragDrop');
        // if (this._open) {
        //     this._tilePreview.close();
        //     this._open = false;
        // }
        // let id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        // });
        // GLib.Source.set_name_by_id(id, '[gnome-shell] extension.dragNtile');
        let source = event.dropActor;
        let target = event.targetActor;

        while (target) {
            if (target._delegate && target._delegate._getCaption && source._delegate && source._delegate._getCaption) {
                console.error('DragnTileExtension.upon-app ', source._delegate._getCaption(), ' on ', target._delegate._getCaption());

                let monitor = target.metaWindow.get_monitor();
                let workspace = target.metaWindow.get_workspace();
                let monitorWorkArea = workspace.get_work_area_for_monitor(monitor);

                target._activate();
                target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                target.metaWindow.move_resize_frame(false, monitorWorkArea.width/2, 0, monitorWorkArea.width/2, monitorWorkArea.height);

                source._activate();
                source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                source.metaWindow.move_resize_frame(false, 0, 0, monitorWorkArea.width/2, monitorWorkArea.height);

                break;
            }
            target = target.get_parent();
        }
        // let the workspace finish the dragdrop procedure
        return DND.DragDropResult.CONTINUE;
    }

    _onDragMotion(event) {
        console.error('DragnTileExtension._onDragMotion x ', event.x, ' y ', event.y);
        let source = event.source;

        source._workspace._windows.forEach((windowPreview, actor) => {
            if (windowPreview instanceof WindowPreview && windowPreview !== source) {
                const topleft = new Graphene.Point3D({x: 0, y: 0});
                const rightbottom = new Graphene.Point3D({x: windowPreview.get_width(), y: windowPreview.get_height()});
                // translate to screen coordinate
                let {x: left, y: top} = windowPreview.apply_transform_to_point(topleft);
                let {x: right, y: bottom} = windowPreview.apply_transform_to_point(rightbottom)

                if (left < event.x && event.x < right && top < event.y && event.y < bottom) {
                    const dstBound = new Mtk.Rectangle({
                        x: left,
                        y: top,
                        width: (right - left) / 2,
                        height: (bottom - top)});
                    let target = event.targetActor;
                    while (target) {
                        if (target instanceof WindowPreview && target !== source) {
                            console.error('DragnTileExtension.target: ', target.get_name());
                            if (!this._showingTip) {
                                this._tileTip = new St.Widget({
                                    name: 'DragnTileTip',
                                    style_class: 'tile-preview',
                                    x: target.get_x(),
                                    y: target.get_y(),
                                    width: target.get_width(),
                                    height: target.get_height(),
                                    opacity: 0,
                                });
                                console.error('DragnTileExtension.add_child parent:', target.get_name(), ' child:', this._tileTip.get_name());

                                target.add_child(this._tileTip);
                                //target.set_child_above_sibling(this._tileTip, null);
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
                                console.error('DragnTileExtension.ease x:', dstBound.x, ' y:', dstBound.y,
                                    ' w:', dstBound.width, ' h:', dstBound.height);
                                console.error('DragnTileExtension.ease');
                                console.error('DragnTileExtension.ease');
                                console.error('DragnTileExtension.ease');
                                console.error('DragnTileExtension.ease');

                                this._showingTip = true;
                                break;
                            }
                        }
                        target = target.get_parent();
                    }
                } else {
                    if (this._showingTip) {
                        this._tileTip.hide();
                        this._showingTip = false;
                    }
                }

            }
        });

        // always listen dragmotion event
        return DND.DragDropResult.CONTINUE;
    }
}
