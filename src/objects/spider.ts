import { canStaggerUpdate, createDisparateObject, rotateAroundPoint } from "../utilities/utilities";

const BODY_HEAD_RADIUS = 10;
const BODY_BUTT_RADIUS = 20;
const DISTANCE_BETWEEN_HEAD_AND_BUTT = 10;
const SPIDER_BODY_MOVE_SPEED = 0.25;
const MOUSE_TO_BODY_DISTANCE_FOR_MOVE = 10;

let scene: Phaser.Scene;
let canvas: HTMLCanvasElement;
let cacheDelta = 0;
const mouse = new Phaser.Math.Vector2(0, 0);

const rad = (deg): number => (deg * Math.PI) / 180;

const DEBUG_LIMB_START_AND_END = false;
const LEGS_OSCILLATE_AMPLITUDE = 5;
const LEGS_OSCILLATE_FREQUENCY = 70;
const LIMBS_LENGTH = 80;
const TIME_BEFORE_NEW_FORCED_LIMB_TARGET = 1000;
const LIMB_DISTANCE_FOR_NEW_TARGET_MIN = 100;
const LIMB_DISTANCE_FOR_NEW_TARGET_MAX = 125;
const LIMB_TARGET_SLERP_RATE = 0.98; // the higher, the slower the target turns

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
    private startLimbEndTarget: Phaser.Math.Vector2;
    private limbDistanceForNewTarget: number;
    private timeBeforeForcedNewLimbTarget = TIME_BEFORE_NEW_FORCED_LIMB_TARGET;
    private currentLimbRotationTarget = 0;
    constructor(
        private bodyOffsetX: number,
        private bodyOffsetY: number,
        partsAmount: number,
        partLength: number,
        private limbEndTarget: Phaser.Math.Vector2,
        private oscillateDir: -1 | 1
    ) {
        this.startLimbEndTarget = limbEndTarget.clone();
        for (let i = 0; i < partsAmount; i++) {
            this.joints.push(new Joint(0, 0, partLength));
            this.angles.push(0);
        }
        this.limbId = Limb.currentLimbId;

        Limb.currentLimbId += 1;
        this.setNewLimbDistanceForNewTarget();
    }

    update(body: Body): void {
        this.oscillateTime += cacheDelta;

        // const bodyContainerPosition = new Phaser.Math.Vector2(body.bodyContainer.x, body.bodyContainer.y);
        // this.limbEndTarget = new Phaser.Math.Vector2(scene.input.activePointer.worldX, scene.input.activePointer.worldY).subtract(bodyContainerPosition);

        this.inverseKinematics(this.limbEndTarget.clone());
        this.oscillateLimbEndTarget();
        this.slerpCurrentLimbAngleTargetTowardsBodyRotation(body, LIMB_TARGET_SLERP_RATE);
        this.decrementForcedLimbTargetTimer(body); // when going in a circle, some joints "hang" on the inside (ie.: don't move to new point for some reason), so I am forcing them to new position after time
        this.maybeSetNewLimbTarget(body);
        this.moveLimbToBody(body);
        this.moveLegJoints();
    }

    setNewLimbDistanceForNewTarget(): void {
        this.limbDistanceForNewTarget = Phaser.Math.Between(LIMB_DISTANCE_FOR_NEW_TARGET_MIN, LIMB_DISTANCE_FOR_NEW_TARGET_MAX);
    }

    decrementForcedLimbTargetTimer(body: Body): void {
        this.timeBeforeForcedNewLimbTarget -= cacheDelta;
        if (this.timeBeforeForcedNewLimbTarget <= 0) {
            this.setNewLimbTarget(body);
        }
    }

    setNewLimbTarget(body: Body): void {
        const limbEndTargetWithBodyAngle = this.getLimbEndTargetWithBodyAngle(body);
        this.setNewLimbDistanceForNewTarget();
        this.limbEndTarget = limbEndTargetWithBodyAngle.clone();
        this.timeBeforeForcedNewLimbTarget = TIME_BEFORE_NEW_FORCED_LIMB_TARGET;
    }

    maybeSetNewLimbTarget(body: Body): void {
        const lastJoint = this.joints[this.joints.length - 1];

        const limbEndTargetWithBodyAngle = this.getLimbEndTargetWithBodyAngle(body);
        const distanceBetween_currentEndPositionAndTarget = Phaser.Math.Distance.BetweenPoints(lastJoint.pos, limbEndTargetWithBodyAngle);
        const distanceBetween_lastJointAndLimbEndTarget = Phaser.Math.Distance.BetweenPoints(lastJoint.pos, this.limbEndTarget);
        // is distance between limb and the limb's rotated target OR the limb and its end target greater than values?
        if (distanceBetween_currentEndPositionAndTarget > this.limbDistanceForNewTarget || distanceBetween_lastJointAndLimbEndTarget > 10) {
            this.setNewLimbTarget(body);
        }

        if (DEBUG_LIMB_START_AND_END) {
            createDisparateObject(
                scene,
                "lastJoint_" + this.limbId,
                lastJoint.pos.x,
                lastJoint.pos.y,
                5,
                undefined,
                0x00ff00
            );
            createDisparateObject(
                scene,
                "limbEndTarget_" + this.limbId,
                this.limbEndTarget.x,
                this.limbEndTarget.y,
                5,
                undefined,
                0x0000ff
            );
            createDisparateObject(
                scene,
                "limbEndTargetWithBodyAngle_" + this.limbId,
                limbEndTargetWithBodyAngle.x,
                limbEndTargetWithBodyAngle.y,
                5,
                undefined,
                0xffff00
            );
        }
    }

    slerpCurrentLimbAngleTargetTowardsBodyRotation(body: Body, amount): void {
        // const bodyAngle = Phaser.Math.RAD_TO_DEG * body.bodyContainer.rotation;
        // const shortest_angle = ((((bodyAngle - this.currentLimbRotationTarget) % 360) + 540) % 360) - 180;
        // const newAngle = shortest_angle * amount;
        // this.currentLimbRotationTarget = newAngle;

        const CS = (1 - amount) * Math.cos(body.bodyContainer.rotation) + amount * Math.cos(this.currentLimbRotationTarget);
        const SN = (1 - amount) * Math.sin(body.bodyContainer.rotation) + amount * Math.sin(this.currentLimbRotationTarget);
        const C = Math.atan2(SN, CS);
        this.currentLimbRotationTarget = C;
    }

    getLimbEndTargetWithBodyAngle(body: Body): Phaser.Math.Vector2 {
        const bodyContainerPosition = new Phaser.Math.Vector2(body.bodyContainer.x, body.bodyContainer.y);
        const endPosition = this.startLimbEndTarget.clone().add(bodyContainerPosition);
        const endRotatedPosition = rotateAroundPoint(bodyContainerPosition, this.currentLimbRotationTarget, endPosition);
        return endRotatedPosition;
    }

    moveLegJoints(): void {
        this.joints.forEach((joint, index) => {
            const prevJoint = this.joints[index - 1];

            if (prevJoint) {
                // if (index === this.joints.length - 1) {
                //     const distanceBetween_currentEndPositionAndTarget = Phaser.Math.Distance.BetweenPoints(this.limbCurrentEndPosition, joint.pos);
                //     if (distanceBetween_currentEndPositionAndTarget > 100) {
                //         this.limbCurrentEndPosition = joint.pos.clone();
                //     }
                //     joint.visualLine.setTo(prevJoint.pos.x, prevJoint.pos.y, this.limbCurrentEndPosition.x, this.limbCurrentEndPosition.y);
                // } else {
                //     joint.visualLine.setTo(prevJoint.pos.x, prevJoint.pos.y, joint.pos.x, joint.pos.y);
                // }
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
        const wave = LEGS_OSCILLATE_AMPLITUDE * Math.sin((this.oscillateTime * this.oscillateDir) / LEGS_OSCILLATE_FREQUENCY);
        this.startLimbEndTarget.x += wave;
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
        if (mouseToBodyDistance < MOUSE_TO_BODY_DISTANCE_FOR_MOVE) {
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

        this.body = new Body(x, y);
        this.createLegs();
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
        const leftSide_leg0_targetPosition = new Phaser.Math.Vector2(70, -200);

        // top middle leg
        const leftSide_leg1_bodyPosition = new Phaser.Math.Vector2(-10, -15);
        const leftSide_leg1_targetPosition = new Phaser.Math.Vector2(0, -220);

        // top left leg
        const leftSide_leg2_bodyPosition = new Phaser.Math.Vector2(-20, -10);
        const leftSide_leg2_targetPosition = new Phaser.Math.Vector2(-70, -200);

        // right legs (left side)
        // right top
        this.limbs.push(
            new Limb(
                leftSide_leg0_bodyPosition.x + allOffset.x,
                leftSide_leg0_bodyPosition.y + allOffset.y,
                4,
                LIMBS_LENGTH,
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
                LIMBS_LENGTH,
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
                LIMBS_LENGTH,
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
                LIMBS_LENGTH,
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
                LIMBS_LENGTH,
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
                LIMBS_LENGTH,
                new Phaser.Math.Vector2(leftSide_leg2_targetPosition.x, -leftSide_leg2_targetPosition.y),
                1
            )
        );
    }
}
