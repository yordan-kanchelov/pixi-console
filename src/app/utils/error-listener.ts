export default class ErrorListener {
    private callback?: (e: ErrorEvent) => void;
    private listening = false;

    /**
     *
     */
    constructor(callback: (e: ErrorEvent) => void) {
        this.callback = callback;

        this.startListening();
    }

    startListening(): void {
        this.listening = true;

        if (typeof window !== "undefined" && this.callback) {
            window.addEventListener("error", this.callback);
        }
    }

    stopListening(): void {
        this.listening = false;

        if (typeof window !== "undefined" && this.callback) {
            window.removeEventListener("error", this.callback);
        }
    }

    dispose(): void {
        if (this.listening) {
            this.stopListening();
        }

        this.callback = undefined;
    }
}
