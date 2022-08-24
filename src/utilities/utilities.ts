interface DisparateObjectData {
    uniqueName: string;
}
export enum DisparateObjectTypes {
    Circle = "Circle",
    Rectangle = "Rectangle",
}
const DISPARATE_OBJECT_DATA_KEY_NAME = "disparateObjectData";
const DISPARATE_OBJECTS: (Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle)[] = [];
const DISPARATE_CIRCLE_DEFAULT_RADIUS = 10;
const COLOR_PURPLE = 0xff00ff;
export function createDisparateObject(
    scene: Phaser.Scene,
    uniqueName: string,
    x: number,
    y: number,
    radius = DISPARATE_CIRCLE_DEFAULT_RADIUS,
    objectType = DisparateObjectTypes.Circle,
    color = COLOR_PURPLE
): void {
    const maybeCreatedDisparateObject = DISPARATE_OBJECTS.find(
        (circle) => (circle.getData(DISPARATE_OBJECT_DATA_KEY_NAME) as DisparateObjectData).uniqueName === uniqueName
    );
    if (maybeCreatedDisparateObject) {
        maybeCreatedDisparateObject.setPosition(x, y);
    } else {
        let newDisparateObject: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
        if (objectType === DisparateObjectTypes.Circle) {
            newDisparateObject = scene.add.circle(x, y, radius, color);
        } else if (objectType === DisparateObjectTypes.Rectangle) {
            newDisparateObject = scene.add.rectangle(x, y, radius, color);
        }
        newDisparateObject.setData(DISPARATE_OBJECT_DATA_KEY_NAME, {
            uniqueName: uniqueName,
        } as DisparateObjectData);
        DISPARATE_OBJECTS.push(newDisparateObject);
    }
}

export function xyDirection_fromAngle(rad: number): Phaser.Math.Vector2 {
    const ret = new Phaser.Math.Vector2();

    ret.x = Math.cos(rad);
    ret.y = Math.sin(rad);

    return ret;
}

export function canStaggerUpdate(time: number, delta: number, stagger: number): boolean {
    if ((time % stagger) + delta >= stagger) {
        return true;
    }
    return false;
}

export function rotateAroundPoint(origin: Phaser.Math.Vector2, angle: number, point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const px = Math.cos(angle) * (point.x - origin.x) - Math.sin(angle) * (point.y - origin.y) + origin.x;
    const py = Math.sin(angle) * (point.x - origin.x) + Math.cos(angle) * (point.y - origin.y) + origin.y;
    return new Phaser.Math.Vector2(px, py);

    // p'x = cos(theta) * (px-ox) - sin(theta) * (py-oy) + ox

    // p'y = sin(theta) * (px-ox) + cos(theta) * (py-oy) + oy
}
