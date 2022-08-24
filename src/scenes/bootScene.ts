import { SCENE_NAMES } from "../constants";

export default class BootScene extends Phaser.Scene {
    constructor() {
        super(SCENE_NAMES.bootScene);
    }

    preload(): void {
        //
    }

    create(): void {
        this.input.on("pointerdown", () => {
            this.scene.start(SCENE_NAMES.titleScene);
        });

        this.add.text(this.game.canvas.width / 2, this.game.canvas.height / 2, "Click for spooder", {
            fontFamily: "Arial",
            fontSize: "30px",
            shadow: {
                color: "#000000",
                fill: true,
                offsetX: 2,
                offsetY: 2
            } as Phaser.Types.GameObjects.Text.TextShadow
        } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5);
    }
}
