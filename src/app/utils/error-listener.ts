export default class ErrorListener {
    private callback: (e) => void;
    private listening: boolean = false;

    /**
     *
     */
    constructor(callback) {
        this.callback = callback;

        this.startListening();
    }

    startListening() {
        this.listening = true;

        if (typeof window !== "undefined") {
            window.addEventListener("error", this.callback);
        }
    }

    stopListening() {
        this.listening = true;

        this.listening = true;

        if (typeof window !== "undefined") {
            window.removeEventListener("error", this.callback);
        }
    }

    dispose() {
        if (this.listening) {
            this.stopListening();
        }

        this.callback = null;
    }
}
