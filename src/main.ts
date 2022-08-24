import * as Phaser from "phaser";
import BootScene from "./scenes/bootScene";
import TitleScene from "./scenes/titleScene";

const scaleConfig: Phaser.Types.Core.ScaleConfig = {};

const gameContainerId = "gameContainer";

const gameContainer = document.createElement("div");

const resizeHandler = (): void => {
    gameContainer.style.width = window.innerWidth.toString() + "px";
    gameContainer.style.height = window.innerHeight.toString() + "px";
};

// resizeHandler();

scaleConfig.width = window.innerWidth;
scaleConfig.height = window.innerHeight;
const gameConfig: Phaser.Types.Core.GameConfig = {
    title: "Spider 2D Bare Bones Inverse Kinematics",
    type: Phaser.CANVAS,
    scale: scaleConfig,
    render: {
        roundPixels: false,
    },
    parent: gameContainerId,
    backgroundColor: "#bbbbbb",
    scene: [BootScene, TitleScene],
};

export const game = new Phaser.Game(gameConfig);

window.addEventListener("resize", () => {
    resizeHandler();
    game.scale.resize(window.innerWidth, window.innerHeight);
});
