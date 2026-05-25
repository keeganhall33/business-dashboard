import type { Preview } from "@storybook/react";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#050510" },
        { name: "zinc", value: "#09090b" }
      ]
    }
  }
};

export default preview;

