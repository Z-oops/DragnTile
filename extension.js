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

// const TilePreview = GObject.registerClass(
// class TilePreview extends St.Widget {
//     _init() {
//         super._init();
//         global.window_group.add_child(this);

//         this._reset();
//         this._showing = false;
//     }

//     open(window, tileRect, monitorIndex) {
//         let windowActor = window.get_compositor_private();
//         //let windowActor = window;
//         if (!windowActor)
//             return;


//         global.window_group.set_child_below_sibling(this, windowActor);
//         //Main.overview._overview.set_child_below_sibling(this, windowActor);
//         //windowActor.set_child_below_sibling(this, windowActor);

//         if (this._rect && this._rect.equal(tileRect))
//             return;

//         let changeMonitor = this._monitorIndex === -1 ||
//                              this._monitorIndex !== monitorIndex;

//         this._monitorIndex = monitorIndex;
//         this._rect = tileRect;

//         let monitor = Main.layoutManager.monitors[monitorIndex];

//         this._updateStyle(monitor);

//         if (!this._showing || changeMonitor) {
//             const monitorRect = new Mtk.Rectangle({
//                 x: monitor.x,
//                 y: monitor.y,
//                 width: monitor.width,
//                 height: monitor.height,
//             });
//             let [, rect] = window.get_frame_rect().intersect(monitorRect);
//             this.set_size(rect.width, rect.height);
//             this.set_position(rect.x, rect.y);
//             this.opacity = 0;
//         }

//         this._showing = true;
//         this.show();
//         this.ease({
//             x: tileRect.x,
//             y: tileRect.y,
//             width: tileRect.width,
//             height: tileRect.height,
//             opacity: 255,
//             duration: WINDOW_ANIMATION_TIME,
//             mode: Clutter.AnimationMode.EASE_OUT_QUAD,
//         });
//     }

//     close() {
//         if (!this._showing)
//             return;

//         this._showing = false;
//         this.ease({
//             opacity: 0,
//             duration: WINDOW_ANIMATION_TIME,
//             mode: Clutter.AnimationMode.EASE_OUT_QUAD,
//             onComplete: () => this._reset(),
//         });
//     }

//     _reset() {
//         this.hide();
//         this._rect = null;
//         this._monitorIndex = -1;
//     }

//     _updateStyle(monitor) {
//         let styles = ['tile-preview'];
//         if (this._monitorIndex === Main.layoutManager.primaryIndex)
//             styles.push('on-primary');
//         if (this._rect.x === monitor.x)
//             styles.push('tile-preview-left');
//         if (this._rect.x + this._rect.width === monitor.x + monitor.width)
//             styles.push('tile-preview-right');

//         this.style_class = styles.join(' ');
//     }
// });


export default class DragnTileExtension extends Extension {
    enable() {
        this._dragMonitor = {
            dragDrop: this._onDragDrop.bind(this),
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        this._tilePreview = new WM.TilePreview();
        this._open = false;
    }

    disable() {
        DND.removeDragMonitor(this._dragMonitor);
    }

    _onDragDrop(event) {
        console.error('DragnTileExtension._onDragDrop');
        // let id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        // });
        // GLib.Source.set_name_by_id(id, '[gnome-shell] extension.dragNtile');
        let source = event.dropActor;
        let target = event.targetActor;

        while (target) {
            if (target._delegate && target._delegate._getCaption && source._delegate && source._delegate._getCaption) {
                console.error('DragnTileExtension.upon-app ', source._delegate._getCaption(), ' on ', target._delegate._getCaption());

                // let monitor = target.metaWindow.get_monitor();
                // let workspace = target.metaWindow.get_workspace();
                // let monitorWorkArea = workspace.get_work_area_for_monitor(monitor);

                // target._activate();
                // target.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                // target.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                // target.metaWindow.move_resize_frame(false, monitorWorkArea.width/2, 0, monitorWorkArea.width/2, monitorWorkArea.height);

                // source._activate();
                // source.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                // source.metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
                // source.metaWindow.move_resize_frame(false, 0, 0, monitorWorkArea.width/2, monitorWorkArea.height);

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
        let monitor = source.metaWindow.get_monitor();

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
                        if (target._delegate && target._delegate.metaWindow) {
                            target.queue_redraw();
                            console.error('DragnTileExtension.queue_redraw: ', target.get_name());
                            if (!this._open) {
                                console.error('DragnTileExtension.dstBound ', dstBound, '{', dstBound.width, dstBound.height, '}');
                                this._tilePreview.open(target, dstBound, monitor);
                                this._open = true;
                                break;
                            }
                        }
                        target = target.get_parent();
                    }
                } else {
                    this._tilePreview.close();
                    this._open = false;
                }

            }
        });

        //console.error('DragnTileExtension._onDragMotion x ');
        // always listen dragmotion event
        return DND.DragDropResult.CONTINUE;
    }
}
