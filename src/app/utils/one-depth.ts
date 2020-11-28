//This function limits a Json.Stringify to only one depth to prevent circular objects from exploding.
export default function oneDepth(k: string, v: any) {
    if (!k || !v) return v;
    if (typeof v == "object") {
        if (v.constructor) {
            return "[object " + v.constructor.name + "]";
        } else {
            return v;
        }
    } else {
        return v;
    }
}
