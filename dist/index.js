"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.API_URL || "https://api.cloakerguard.com.br";
function normalizeHost(raw = "") {
    return raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}
app.use(async (req, res) => {
    try {
        const host = normalizeHost(req.headers["x-forwarded-host"] || req.headers.host || "");
        if (!host)
            return res.status(400).send("Host header required");
        console.log("[EDGE] Requisição recebida para host:", host);
        // chamada para API central
        const resp = await axios_1.default.get(`${API_URL}/domains/resolve`, {
            params: { host },
            timeout: 5000, // evita travar se a API demorar
        });
        const data = resp.data;
        const target = data.blackOrigin || data.whiteOrigin;
        if (!target)
            return res.status(500).send("Nenhum destino configurado");
        console.log(`[EDGE] Redirecionando ${host} -> ${target}`);
        res.setHeader("Cache-Control", "no-store"); // evitar cache
        return res.redirect(302, target);
    }
    catch (err) {
        console.error("[EDGE] Erro:", err.message);
        return res.status(500).send("Internal proxy error");
    }
});
app.listen(PORT, () => {
    console.log(`🌍 Edge rodando na porta ${PORT}`);
});
