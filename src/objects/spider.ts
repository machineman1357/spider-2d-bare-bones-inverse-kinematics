import { canStaggerUpdate, createDisparateObject, rotateAroundPoint } from "../utilities/utilities";

const BODY_HEAD_RADIUS = 10;
const BODY_BUTT_RADIUS = 20;
const DISTANCE_BETWEEN_HEAD_AND_BUTT = 10;
const SPIDER_BODY_MOVE_SPEED = 0.25;

let scene: Phaser.Scene;
let canvas: HTMLCanvasElement;
let cacheDelta = 0;
const mouse = new Phaser.Math.Vector2(0, 0);

const rad = (deg): number => (deg * Math.PI) / 180;

const DEBUG_LIMB_START_AND_END = false;

class Joint {
    pos: Phaser.Math.Vector2;
    angle: number;
    private len: number;
    visualLine: Phaser.GameObjects.Line;
    constructor(x, y, len = 25) {
        this.pos = new Phaser.Math.Vector2(x, y);
        this.angle = 0;
        this.len = len;

        this.createVisualLine();
    }

    update(joint: Joint): void {
        if (!joint) {
            return;
        }

        const angularVector = new Phaser.Math.Vector2(Math.sin(this.angle) * this.len, Math.cos(this.angle) * this.len);

        this.pos = joint.pos.clone().add(angularVector);
    }

    createVisualLine(): void {
        this.visualLine = scene.add.line(0, 0, 0, 0, 0, 0, 0x000000);
    }
}

class Limb {
    static LEARNING_RATE = 4; // default: 50
    static SAMPLING_DISTANCE = 10; // default: 1
    static ACCURACY = 1; // default: 5
    static currentLimbId = 0;

    private joints: Joint[] = [];
    private angles: number[] = [];
    private limbId: number;
    private oscillateTime = 0;
    constructor(
        private bodyOffsetX: number,
        private bodyOffsetY: number,
        partsAmount: number,
        partLength: number,
        private limbEndTarget: Phaser.Math.Vector2,
        private oscillateDir: -1 | 1
    ) {
        for (let i = 0; i < partsAmount; i++) {
            this.joints.push(new Joint(0, 0, partLength));
            this.angles.push(0);
        }
        this.limbId = Limb.currentLimbId;

        Limb.currentLimbId += 1;
    }

    update(body: Body): void {
        this.oscillateTime += cacheDelta;
        this.inverseKinematics(this.getLimbEndTargetWithBodyPositionAndAngle(body));
        this.oscillateLimbEndTarget();
        this.moveLimbToBody(body);
        this.moveLegJoints();
    }

    getLimbEndTargetWithBodyPositionAndAngle(body: Body): Phaser.Math.Vector2 {
        const bodyContainerPosition = new Phaser.Math.Vector2(body.bodyContainer.x, body.bodyContainer.y);
        const endPosition = this.limbEndTarget.clone().add(bodyContainerPosition);
        const endRotatedPosition = rotateAroundPoint(bodyContainerPosition, body.bodyContainer.rotation, endPosition);
        if (DEBUG_LIMB_START_AND_END) {
            createDisparateObject(
                scene,
                "getLimbEndTargetWithBodyPositionAndAngle_" + this.limbId,
                endRotatedPosition.x,
                endRotatedPosition.y,
                5,
                undefined,
                0x00ff00
            );
        }
        return endRotatedPosition;
    }

    moveLegJoints(): void {
        this.joints.forEach((joint, index) => {
            const prevJoint = this.joints[index - 1];

            if (prevJoint) {
                joint.visualLine.setTo(prevJoint.pos.x, prevJoint.pos.y, joint.pos.x, joint.pos.y);
            }
        });
    }

    forwardKinematics(): Phaser.Math.Vector2 {
        this.joints.forEach((joint, index) => {
            const prevJoint = this.joints[index - 1];

            joint.angle = rad(this.angles[index]);
            joint.update(prevJoint);
        });

        return this.joints[this.joints.length - 1].pos;
    }

    inverseKinematics(target: Phaser.Math.Vector2): void {
        this.joints.forEach((joint, index) => {
            const result = this.forwardKinematics();
            const error = this.getError(result, target);

            if (error < Limb.ACCURACY) {
                return;
            }

            const tempCurrentAngle = this.angles[index];

            this.angles[index] += Limb.SAMPLING_DISTANCE;

            const newResult = this.forwardKinematics();
            const newError = this.getError(newResult, target);

            const errorDiff = (newError - error) / Limb.SAMPLING_DISTANCE;

            this.angles[index] = tempCurrentAngle;

            this.angles[index] -= errorDiff * Limb.LEARNING_RATE;

            const prevJoint = this.joints[index - 1];

            joint.update(prevJoint);
        });
    }

    getError(current: Phaser.Math.Vector2, target: Phaser.Math.Vector2): number {
        return Phaser.Math.Distance.BetweenPoints(current, target);
    }

    oscillateLimbEndTarget(): void {
        const amplitude = 10;
        const frequency = 70;
        const wave = amplitude * Math.sin((this.oscillateTime * this.oscillateDir) / frequency);
        this.limbEndTarget.x += wave;
    }

    moveLimbToBody(body: Body): void {
        const bodyContainerPosition = new Phaser.Math.Vector2(body.bodyContainer.x, body.bodyContainer.y);
        const endPosition = new Phaser.Math.Vector2(body.bodyContainer.x + this.bodyOffsetX, body.bodyContainer.y + this.bodyOffsetY);
        const endRotatedPosition = rotateAroundPoint(bodyContainerPosition, body.bodyContainer.rotation, endPosition);
        if (DEBUG_LIMB_START_AND_END) {
            createDisparateObject(scene, "moveLimbToBody_" + this.limbId, endRotatedPosition.x, endRotatedPosition.y, 5, undefined, 0xff0000);
        }
        this.joints[0].pos.setTo(endRotatedPosition.x, endRotatedPosition.y);
    }
}

class Body {
    bodyContainer: Phaser.GameObjects.Container;
    private circle_head: Phaser.GameObjects.Arc;
    private circle_butt: Phaser.GameObjects.Arc;
    didMove = false;
    constructor(private startX: number, private startY: number) {
        this.createBodyVisuals();
    }

    update(): void {
        this.moveTowardsMouse();
    }

    createBodyVisuals(): void {
        this.bodyContainer = scene.add.container(this.startX, this.startY);
        this.circle_head = scene.add.circle(DISTANCE_BETWEEN_HEAD_AND_BUTT, 0, BODY_HEAD_RADIUS, 0x000000);
        this.circle_butt = scene.add.circle(-DISTANCE_BETWEEN_HEAD_AND_BUTT, 0, BODY_BUTT_RADIUS, 0x000000);

        this.bodyContainer.add([this.circle_head, this.circle_butt]);
    }

    moveTowardsMouse(): void {
        const mousePosition = new Phaser.Math.Vector2(scene.input.activePointer.worldX, scene.input.activePointer.worldY);
        const bodyContainerPosition = new Phaser.Math.Vector2(this.bodyContainer.x, this.bodyContainer.y);
        const mouseToBodyDistance = Phaser.Math.Distance.BetweenPoints(mousePosition, bodyContainerPosition);
        if (mouseToBodyDistance < 20) {
            this.didMove = false;
            return;
        }
        this.didMove = true;

        const direction = mousePosition
            .clone()
            .subtract(bodyContainerPosition)
            .normalize()
            .scale(SPIDER_BODY_MOVE_SPEED * cacheDelta);
        const directionAngle = Phaser.Math.Angle.BetweenPoints(bodyContainerPosition, mousePosition);

        const newPosition = new Phaser.Math.Vector2(this.bodyContainer.x + direction.x, this.bodyContainer.y + direction.y);
        this.bodyContainer.setPosition(newPosition.x, newPosition.y);
        this.bodyContainer.setRotation(directionAngle);
    }
}

export default class Spider {
    private limbs: Limb[] = [];
    private body: Body;
    constructor(_scene: Phaser.Scene, x: number, y: number) {
        scene = _scene;

        canvas = scene.game.canvas;

        canvas.addEventListener("mousemove", (e) => {
            mouse.set(e.clientX, e.clientY);
        });

        this.createLegs();
        this.body = new Body(x, y);
    }

    update(time: number, delta: number): void {
        cacheDelta = delta;
        if (canStaggerUpdate(time, delta, 1)) {
            this.body.update();
            if (this.body.didMove) {
                this.limbs.forEach((limb) => {
                    limb.update(this.body);
                });
            }
        }
    }

    createLegs(): void {
        // The spider faces right, so the following values are relative to that.

        const allOffset = new Phaser.Math.Vector2(0, 0);

        // top right leg
        const leftSide_leg0_bodyPosition = new Phaser.Math.Vector2(0, -10);
        const leftSide_leg0_targetPosition = new Phaser.Math.Vector2(100, -200);

        // top middle leg
        const leftSide_leg1_bodyPosition = new Phaser.Math.Vector2(-10, -15);
        const leftSide_leg1_targetPosition = new Phaser.Math.Vector2(30, -220);

        // top left leg
        const leftSide_leg2_bodyPosition = new Phaser.Math.Vector2(-20, -10);
        const leftSide_leg2_targetPosition = new Phaser.Math.Vector2(-90, -200);

        const limbsLength = 80;

        // right legs (left side)
        // right top
        this.limbs.push(
            new Limb(
                leftSide_leg0_bodyPosition.x + allOffset.x,
                leftSide_leg0_bodyPosition.y + allOffset.y,
                4,
                limbsLength,
                leftSide_leg0_targetPosition,
                1
            )
        );
        // right middle
        this.limbs.push(
            new Limb(
                leftSide_leg1_bodyPosition.x + allOffset.x,
                leftSide_leg1_bodyPosition.y + allOffset.y,
                4,
                limbsLength,
                leftSide_leg1_targetPosition,
                -1
            )
        );
        // right middle
        this.limbs.push(
            new Limb(
                leftSide_leg2_bodyPosition.x + allOffset.x,
                leftSide_leg2_bodyPosition.y + allOffset.y,
                4,
                limbsLength,
                leftSide_leg2_targetPosition,
                1
            )
        );

        // Bottom legs
        // Bottom right
        this.limbs.push(
            new Limb(
                leftSide_leg0_bodyPosition.x + allOffset.x,
                -leftSide_leg0_bodyPosition.y - allOffset.y,
                4,
                limbsLength,
                new Phaser.Math.Vector2(leftSide_leg0_targetPosition.x, -leftSide_leg0_targetPosition.y),
                1
            )
        );
        // Bottom middle
        this.limbs.push(
            new Limb(
                leftSide_leg1_bodyPosition.x + allOffset.x,
                -leftSide_leg1_bodyPosition.y - allOffset.y,
                4,
                limbsLength,
                new Phaser.Math.Vector2(leftSide_leg1_targetPosition.x, -leftSide_leg1_targetPosition.y),
                -1
            )
        );
        // Bottom left
        this.limbs.push(
            new Limb(
                leftSide_leg2_bodyPosition.x + allOffset.x,
                -leftSide_leg2_bodyPosition.y - allOffset.y,
                4,
                limbsLength,
                new Phaser.Math.Vector2(leftSide_leg2_targetPosition.x, -leftSide_leg2_targetPosition.y),
                1
            )
        );
    }
}
