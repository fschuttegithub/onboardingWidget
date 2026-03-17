import { Component } from "react";

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error("[OnboardingWidget] Unhandled error in tour component:", error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return null; // Widget disappears cleanly; does not crash the page
        }
        return this.props.children;
    }
}
