import { SCENE_NAMES } from "../constants";
import Spider from "../objects/spider";

export default class TitleScene extends Phaser.Scene {
    private spiders: Spider[] = [];

    constructor() {
        super(SCENE_NAMES.titleScene);
    }

    preload(): void {
        //
    }

    create(): void {
        const centerPosition = new Phaser.Math.Vector2(this.game.canvas.width / 2, this.game.canvas.height / 2);
        // for (let i = 0; i < 5; i++) {
        //     const randomPositionExtra = new Phaser.Math.Vector2(Phaser.Math.Between(-200, 100), Phaser.Math.Between(-200, 100));
        //     this.spiders.push(new Spider(this, centerPosition.x + randomPositionExtra.x, centerPosition.y + randomPositionExtra.y));
        // }
        this.spiders.push(new Spider(this, centerPosition.x, centerPosition.y));
    }

    update(time: number, delta: number): void {
        this.spiders.forEach((spider) => {
            spider.update(time, delta);
        });
    }
}
