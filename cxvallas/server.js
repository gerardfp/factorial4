const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');

const MIME_TYPES = {
    '.html': 'text/html',
    '.png': 'image/png',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon',
};

const PUBLIC_FILES = new Set(['index.html', 'atlas.png', 'ps2p.ttf', 'cgpixel.ttf', 'favicon.ico']);

const server = http.createServer((request, response) => {
    const cleanPath = (request.url || '/').split('?')[0];
    const fileName = cleanPath === '/' ? 'index.html' : cleanPath.slice(1);

    if (!PUBLIC_FILES.has(fileName)) {
        response.writeHead(404);
        return response.end();
    }

    const filePath = path.join(__dirname, fileName);
    const contentType = MIME_TYPES[path.extname(fileName)] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            response.writeHead(500);
            return response.end();
        }
        response.writeHead(200, { 'Content-Type': contentType });
        response.end(content);
    });
});

const wss = new WebSocket.Server({ server });

class Player {
    constructor(carril, data){
        this.name = data.name;
        this.carril = carril;
    }
}

class Carrera {
    constructor(){
        this.id = Math.random();
        this.ncarriles = 8;
        this.w2p = {};   // websocketid -> player
        this.wss = [];
        this.players = [];
        this.starting = false;
        this.started = false;
        this.finished = false;
        this.podium = [];
        this.disqualifieds = 0;
        this.wait = null;
        this.finishTimeout = null;
        this.countdownTimeouts = [];
    }

    hasFreeSlot(){
        return !this.starting && !this.started && !this.finished && this.players.length < this.ncarriles;
    }

    getNextFreeCarril(){
        const used = new Set(this.players.map(p => p.carril));
        for(let i = 0; i < this.ncarriles; i++){
            if(!used.has(i)) return i;
        }
        return -1;
    }

    cleanupTimers(){
        if(this.wait){
            clearInterval(this.wait);
            this.wait = null;
        }
        if(this.finishTimeout){
            clearTimeout(this.finishTimeout);
            this.finishTimeout = null;
        }
        for(const t of this.countdownTimeouts){
            clearTimeout(t);
        }
        this.countdownTimeouts = [];
    }

    finish(){
        if(this.finished) return;
        this.finished = true;
        this.cleanupTimers();
        this.enviarTodos({action: "finish", podium: this.podium});
    }

    start(){
        if(this.starting) return;
        this.starting = true;

        if(this.players.length - this.disqualifieds <= 1) {
            this.started = true;
            this.finish();
        } else {
            let that = this;
            for (let i=0; i<3; i++) {
                this.countdownTimeouts.push(setTimeout(() => {
                    that.enviarTodos({action: "countdown", value: 3-i});
                }, 1000+1000*i));
            }
            this.countdownTimeouts.push(setTimeout(() => {
                if(that.finished || that.wss.length === 0) return;
                that.started = true;
                that.enviarTodos({action: "countdown", value: 0});
                if(that.players.length - that.disqualifieds <= 0) {
                    that.finish();
                }
            }, 4000+Math.random()*1500));
        }
    }

    addPlayer(ws, data) {
        let carril = this.getNextFreeCarril();
        if(carril === -1) return false;

        let player = new Player(carril, data);
        this.players.push(player);
        this.w2p[ws.id] = player;
        this.wss.push(ws);
        ws.enviar({action: 'join_ok', player: player, players: this.players});
        this.enviarTodos({action: "new_player", player: player});

        if(this.players.length == 1 && !this.wait) {
            let waiti = 0;
            let that = this;
            this.wait = setInterval(function(){
                if(waiti === 6){
                    clearInterval(that.wait);
                    that.wait = null;
                    that.enviarTodos({action: "wait", value: 0});
                    that.start();
                    return;
                }
                that.enviarTodos({action: "wait", value: 6 - waiti});
                waiti++;
            }, 1000);
        }
        if (this.players.length >= this.ncarriles) {
            if(this.wait){
                clearInterval(this.wait);
                this.wait = null;
            }
            this.enviarTodos({action: "wait", value: 0});
            this.start();
        }
        return true;
    }

    removePlayer(ws) {
        let player = this.w2p[ws.id];
        delete this.w2p[ws.id];
        this.wss = this.wss.filter(client => client.id !== ws.id);

        if(!player) return;

        if(!this.starting && !this.started && !this.finished) {
            this.players = this.players.filter(p => p.carril !== player.carril);
            this.enviarTodos({action: "remove_player", carril: player.carril});
            if(this.players.length === 0 && this.wait) {
                clearInterval(this.wait);
                this.wait = null;
            }
        } else if(!this.finished) {
            if(!player.disqualified && !player.finished) {
                player.disqualified = true;
                this.disqualifieds++;
                this.enviarTodos({action: "disqualify", carril: player.carril});
                if(this.started && this.podium.length >= this.players.length - this.disqualifieds) {
                    this.finish();
                }
            }
        }

        if(this.wss.length === 0) {
            this.cleanupTimers();
        }
    }

    update(ws, data) {
        let player = this.w2p[ws.id];
        if(!player || this.finished) return;

        if(!this.started && data.x > 0 && !player.disqualified) {
            player.disqualified = true;
            this.disqualifieds++;
            this.enviarTodos({action: "disqualify", carril: player.carril});
            if(this.starting && this.players.length - this.disqualifieds <= 0) {
                this.finish();
            }
        } else if (this.started && data.x >= 1000 && !player.finished && !player.disqualified){
            player.finished = true;
            this.podium.push(player);
            if (this.podium.length >= 3 || this.podium.length >= this.players.length - this.disqualifieds) {
                this.finish();
            } else if (!this.finishTimeout) {
                this.finishTimeout = setTimeout(() => {
                    this.finish();
                }, 5000);
            }
        }
        this.enviarTodos({action: "update", carril: player.carril, data: data});
    }

    fall(ws, data) {
        if(!this.w2p[ws.id] || this.finished) return;
        this.enviarTodos({action: "fall", i: data.i, carril: data.carril});
    }

    enviarTodos(m){ for (let ws of this.wss){ ws.enviar(m); }}
}

class Carreras {
    constructor(){
        this.carreras = [];
        this.asignedCarrera = {};
    }

    joinPlayer(ws, data) {
        if(this.asignedCarrera[ws.id]) return;

        let carrera = this.carreras.find(c => c.hasFreeSlot());
        if(!carrera) {
            carrera = new Carrera();
            this.carreras.push(carrera);
        }
        carrera.addPlayer(ws, data);
        this.asignedCarrera[ws.id] = carrera;
    }

    leavePlayer(ws) {
        let carrera = this.asignedCarrera[ws.id];
        delete this.asignedCarrera[ws.id];
        if(!carrera) return;

        carrera.removePlayer(ws);
        if(carrera.wss.length === 0 && (carrera.finished || !carrera.starting)) {
            this.carreras = this.carreras.filter(c => c.id !== carrera.id);
        }
    }

    update(ws, data) {
        let carrera = this.asignedCarrera[ws.id];
        if(carrera && data) carrera.update(ws, data);
    }

    fall(ws, data) {
        let carrera = this.asignedCarrera[ws.id];
        if(carrera && data) carrera.fall(ws, data);
    }
}

let carreras = new Carreras();

wss.on('connection', (ws) => {
    ws.enviar = (m) => {
        if(ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(m));
        }
    };
    ws.id = uuid.v4();

    ws.on('message', (m) => {
        let msg;
        try {
            msg = JSON.parse(m);
        } catch(e) {
            return;
        }

        if(msg.action === 'join') {
            carreras.joinPlayer(ws, msg.data || {});
        } else if (msg.action === 'update') {
            carreras.update(ws, msg.data);
        } else if (msg.action === 'fall') {
            carreras.fall(ws, msg.data);
        }
    });

    ws.on('close', () => {
        carreras.leavePlayer(ws);
    });
});

if (require.main === module) {
    server.listen(8888);
}

module.exports = { server, Carrera, Carreras, Player };