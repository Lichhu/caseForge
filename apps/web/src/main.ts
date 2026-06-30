import { createApp } from "vue";
import { createPinia } from "pinia";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import "./styles/app.less";
import App from "./App.vue";
import router from "./router";
import { configureAppMessage } from "./utils/globalFeedback";
import { initUserContext } from "./utils/userContext";

initUserContext();
configureAppMessage();

createApp(App).use(createPinia()).use(router).use(Antd).mount("#app");
