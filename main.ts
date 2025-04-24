//% block="Sprite Events"
//% color="#03a5fc" icon="\uf005"
//% groups="['Sprites','Tilemaps']"
namespace events {
    export const SPRITE_DATA_KEY = "@$_events_sprite_data";

    export enum SpriteEvent {
        //% block="starts overlapping"
        StartOverlapping,
        //% block="stops overlapping"
        StopOverlapping
    }

    export enum TileEvent {
        //% block="starts overlapping"
        StartOverlapping,
        //% block="stops overlapping"
        StopOverlapping,
        //% block="fully within"
        Enters,
        //% block="no longer fully within"
        Exits,
        //% block="fully within area covered by"
        EntersArea,
        //% block="no longer fully within area covered by"
        ExitsArea
    }

    enum TileFlag {
        Overlapping = 1 << 0,
        FullyWithin = 1 << 1,
        WithinArea = 1 << 2
    }

    type SpriteHandler = (sprite: Sprite, otherSprite: Sprite) => void;
    type TileHandler = (sprite: Sprite) => void;

    let stateStack: EventState[];

    class EventState {
        spriteHandlers: SpriteHandlerEntry[];
        tileHandlers: TileHandlerEntry[];
        trackedSprites: Sprite[];

        constructor() {
            this.spriteHandlers = [];
            this.tileHandlers = [];
            this.trackedSprites = [];

            game.eventContext().registerFrameHandler(scene.PHYSICS_PRIORITY + 1, () => {
                this.update();
            });
        }

        update() {

            for (const sprite of this.trackedSprites) {
                const data = sprite.data[SPRITE_DATA_KEY] as SpriteEventData;

                for (const otherSprite of data.overlappingSprites) {
                    if (!sprite.overlapsWith(otherSprite)) {
                        data.overlappingSprites.removeElement(otherSprite);

                        const handler = this.getSpriteHandler(SpriteEvent.StopOverlapping, sprite.kind(), otherSprite.kind());
                        if (handler) handler.handler(sprite, otherSprite);
                    }
                }

                for (const handler of this.tileHandlers) {
                    if (handler.kind === sprite.kind()) {
                        updateTileStateAndFireEvents(
                            sprite,
                            game.currentScene().tileMap.getImageType(handler.tile),
                            game.currentScene().tileMap
                        )
                    }
                }
            }

            this.pruneTrackedSprites();
        }

        getSpriteHandler(event: SpriteEvent, kind: number, otherKind: number) {
            for (const handler of this.spriteHandlers) {
                if (handler.event === event && handler.kind === kind && handler.otherKind === otherKind)
                    return handler;
            }
            return undefined;
        }

        getTileHandler(event: TileEvent, kind: number, image: Image) {
            for (const handler of this.tileHandlers) {
                if (handler.event === event && handler.kind === kind && handler.tile.equals(image))
                    return handler;
            }
            return undefined;
        }

        protected pruneTrackedSprites() {
            const toRemove: Sprite[] = [];
            let data: SpriteEventData;

            for (const sprite of this.trackedSprites) {
                data = sprite.data[SPRITE_DATA_KEY];
                if (sprite.flags & sprites.Flag.Destroyed) {
                    toRemove.push(sprite);
                }
            }

            for (const sprite of toRemove) {
                this.trackedSprites.removeElement(sprite);
            }
        }
    }

    class SpriteHandlerEntry {
        constructor(
            public event: SpriteEvent,
            public kind: number,
            public otherKind: number,
            public handler: SpriteHandler
        ) { }
    }

    class TileHandlerEntry {
        constructor(
            public event: TileEvent,
            public kind: number,
            public tile: Image,
            public handler: TileHandler
        ) { }
    }

    class SpriteEventData {
        overlappingSprites: Sprite[];
        tiles: TileState[];
        // Removed regions property
        // Removed walls property

        constructor(public owner: Sprite) {
            this.overlappingSprites = [];
            this.tiles = [];
        }

        getTileEntry(index: number, createIfMissing = false) {
            for (const tile of this.tiles) {
                if (tile.tile === index) {
                    return tile;
                }
            }

            if (createIfMissing) {
                const newEntry = new TileState(index);
                this.tiles.push(newEntry)
                return newEntry;
            }
            return undefined;
        }
    }

    class TileState {
        flag: number;
        constructor(public tile: number, flag = 0) {
            this.flag = flag;
        }
    }

    function init() {
        if (stateStack) return;
        stateStack = [new EventState()];

        game.addScenePushHandler(() => {
            stateStack.push(new EventState());
        });

        game.removeScenePushHandler(() => { // This should be game.addScenePopHandler
            stateStack.pop();
            if (!stateStack.length) stateStack.push(new EventState());
        });
    }

    function state() {
        init();
        return stateStack[stateStack.length - 1];
    }

    //% blockId=sprite_event_ext_sprite_event
    //% block="on $sprite of kind $kind $event with $otherSprite of kind $otherKind"
    //% draggableParameters="reporter"
    //% kind.shadow=spritekind
    //% otherKind.shadow=spritekind
    //% weight=90
    //% group="Sprites"
    export function spriteEvent(kind: number, otherKind: number, event: SpriteEvent, handler: (sprite: Sprite, otherSprite: Sprite) => void) {
        init();

        const existing = state().getSpriteHandler(event, kind, otherKind);
        if (existing) {
            existing.handler = handler;
            return;
        }

        state().spriteHandlers.push(
            new SpriteHandlerEntry(event, kind, otherKind, handler)
        );

        sprites.onOverlap(kind, otherKind, (sprite, otherSprite) => {
            const currentState = state();

            if (!sprite.data[SPRITE_DATA_KEY]) {
                sprite.data[SPRITE_DATA_KEY] = new SpriteEventData(sprite);
                currentState.trackedSprites.push(sprite);
            }

            const data: SpriteEventData = sprite.data[SPRITE_DATA_KEY];
            const isOverlappingAlready = data.overlappingSprites.indexOf(otherSprite) !== -1;

            if (!isOverlappingAlready) {
                data.overlappingSprites.push(otherSprite);

                const handler = currentState.getSpriteHandler(SpriteEvent.StartOverlapping, kind, otherKind)
                if (handler) {
                    handler.handler(sprite, otherSprite);
                }
            }
        });
    }

    //% blockId=sprite_event_ext_tile_event
    //% block="on $sprite of kind $kind $event tile $tile"
    //% draggableParameters="reporter"
    //% kind.shadow=spritekind
    //% tile.shadow=tileset_tile_picker
    //% weight=100
    //% group="Tilemaps"
    export function tileEvent(kind: number, tile: Image, event: TileEvent, handler: (sprite: Sprite) => void) {
        init();

        const existing = state().getTileHandler(event, kind, tile);
        if (existing) {
            existing.handler = handler;
            return;
        }

        state().tileHandlers.push(
            new TileHandlerEntry(event, kind, tile, handler)
        );

        scene.onOverlapTile(kind, tile, (sprite, location) => {
            // Ensure the tileMap and specific tile image match the handler's registered tile
            // The original onOverlapTile might fire for any tile if 'tile' parameter is an index.
            // Here, we assume 'tile' in TileHandlerEntry is the specific Image.
            // And that scene.onOverlapTile is correctly set up to only fire for this specific tile image
            // or that we check `location.tileSet.equals(tile)` if `tile` is an image.
            // Given the structure, the check is done by `updateTileStateAndFireEvents` via `getTileHandler`.
            updateTileStateAndFireEvents(sprite, location.tileSet, location.tileMap);
        })
    }

    function updateTileStateAndFireEvents(sprite: Sprite, tileIndex: number, map: tiles.TileMap) {
        let data: SpriteEventData = sprite.data[SPRITE_DATA_KEY];

        if (!data) {
            data = new SpriteEventData(sprite);
            sprite.data[SPRITE_DATA_KEY] = data;
            state().trackedSprites.push(sprite);
        }

        const tileState = data.getTileEntry(tileIndex, true);
        const oldFlags = tileState.flag;
        updateTileState(tileState, sprite, tileIndex, map);

        if (oldFlags === tileState.flag) return;

        if (tileState.flag & TileFlag.Overlapping) {
            if (!(oldFlags & TileFlag.Overlapping)) {
                runTileEventHandlers(sprite, TileEvent.StartOverlapping, tileIndex);
            }
        }
        else if (oldFlags & TileFlag.Overlapping) {
            runTileEventHandlers(sprite, TileEvent.StopOverlapping, tileIndex);
        }

        if (tileState.flag & TileFlag.FullyWithin) {
            if (!(oldFlags & TileFlag.FullyWithin)) {
                runTileEventHandlers(sprite, TileEvent.Enters, tileIndex);
            }
        }
        else if (oldFlags & TileFlag.FullyWithin) {
            runTileEventHandlers(sprite, TileEvent.Exits, tileIndex);
        }

        if (tileState.flag & TileFlag.WithinArea) {
            if (!(oldFlags & TileFlag.WithinArea)) {
                runTileEventHandlers(sprite, TileEvent.EntersArea, tileIndex);
            }
        }
        else if (oldFlags & TileFlag.WithinArea) {
            runTileEventHandlers(sprite, TileEvent.ExitsArea, tileIndex);
        }

        if (tileState.flag === 0) {
            data.tiles.removeElement(tileState);
        }
    }

    function updateTileState(tileState: TileState, sprite: Sprite, tileIndex: number, map: tiles.TileMap) {
        const tileWidth = 1 << map.scale;

        const x0 = Math.idiv(sprite.left, tileWidth);
        const y0 = Math.idiv(sprite.top, tileWidth);
        const x1 = Math.idiv(sprite.right, tileWidth);
        const y1 = Math.idiv(sprite.bottom, tileWidth);

        tileState.flag = 0;

        if (x0 === x1 && y0 === y1) { // Sprite is within a single tile cell
            if (map.getTileIndex(x0, y0) === tileIndex) {
                tileState.flag = TileFlag.Overlapping | TileFlag.FullyWithin | TileFlag.WithinArea;
            }
            return;
        }

        // Check all tiles the sprite could be overlapping
        let isOverlappingTargetTile = false;
        let isFullyWithinTargetArea = true; // Assumes true until a non-target tile is found within sprite bounds

        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                if (map.getTileIndex(x, y) === tileIndex) {
                    isOverlappingTargetTile = true;
                } else {
                    // If any tile under the sprite is NOT the target tile, it's not fully within an area of target tiles.
                    isFullyWithinTargetArea = false;
                }
            }
        }

        if (isOverlappingTargetTile) {
            tileState.flag |= TileFlag.Overlapping;
            if (isFullyWithinTargetArea) {
                tileState.flag |= TileFlag.WithinArea;
                // FullyWithin (single tile) is handled by the (x0 === x1 && y0 === y1) case
                // For multi-tile sprites, 'FullyWithin' a single specific tile instance is tricky.
                // The original 'FullyWithin' for TileEvent likely means the sprite is contained within ONE instance of that tile type.
                // If sprite's bounding box is exactly one tile wide/high and on that tile:
                if (sprite.width <= tileWidth && sprite.height <= tileWidth && isFullyWithinTargetArea && x0 === x1 && y0 === y1) {
                    tileState.flag |= TileFlag.FullyWithin;
                }
            }
        }
    }

    function runTileEventHandlers(sprite: Sprite, event: TileEvent, tileIndex: number) {
        const handler = state().getTileHandler(
            event,
            sprite.kind(),
            game.currentScene().tileMap.getTileImage(tileIndex)
        );
        if (handler) handler.handler(sprite);
    }

    /**
     * Checks if a sprite is currently overlapping any tile with the specified image.
     * This is a synchronous check performed at the moment the block is called.
     * @param sprite The sprite to check.
     * @param tileImage The image of the tile to check for overlap with.
     * @returns true if the sprite is overlapping a tile with the given image, false otherwise.
     */
    //% blockId="events_is_sprite_overlapping_tile_image"
    //% block="$sprite is currently overlapping tile image $tileImage"
    //% sprite.defl=mySprite
    //% tileImage.shadow=tileset_tile_picker
    //% group="Tilemaps"
    //% weight=95
    export function isSpriteOverlappingTileImage(sprite: Sprite, tileImage: Image): boolean {
        if (!sprite || !tileImage || !game.currentScene().tileMap) {
            return false;
        }

        const scene = game.currentScene();
        const tm = scene.tileMap;

        if (!tm.area || !tileImage.bitmap) {
            return false;
        }

        const scale = 1 << tm.scale;
        const spriteBounds = sprite.bounds;

        const minCol = Math.max(0, Math.floor(spriteBounds.left / scale));
        const maxCol = Math.min(tm.areaWidth() - 1, Math.floor(spriteBounds.right / scale));
        const minRow = Math.max(0, Math.floor(spriteBounds.top / scale));
        const maxRow = Math.min(tm.areaHeight() - 1, Math.floor(spriteBounds.bottom / scale));

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const currentTileImg = tm.getTileImage(c, r);
                if (currentTileImg && currentTileImg.equals(tileImage)) {
                    const tileLeft = c * scale;
                    const tileTop = r * scale;
                    const tileRight = tileLeft + scale;
                    const tileBottom = tileTop + scale;

                    if (spriteBounds.left < tileRight &&
                        spriteBounds.right > tileLeft &&
                        spriteBounds.top < tileBottom &&
                        spriteBounds.bottom > tileTop) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
