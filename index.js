import osjs from "osjs";
import {name as applicationName} from "./metadata.json";

import {
	h,
	app
} from "hyperapp";

import {
	Box,BoxContainer,Button,Icon,Menubar,MenubarItem
} from "@osjs/gui";

const GBA = require("gbajs");

const createWindow = async (proc,core,metadata) => {
	var canvas = document.createElement("canvas");
	var ctx = canvas.getContext("2d");
	canvas.width = 240;
	canvas.height = 260;
	canvas.style.width = canvas.width+"px";
	canvas.style.height = canvas.height+"px";
	canvas.style.backgroundColor = "black";
	var gba = new GBA();
	gba.logLevel = gba.LOG_ERROR;
	gba.setCanvas(canvas);
	gba.video.finishDraw = fb => {
		ctx.putImageData(fb,0,0);
		gba.video.drawCallback();
	};
	const AudioContext = window.AudioContext || window.webkitAudioContext;
	gba.audio.context = new AudioContext();
	gba.audio.bufferSize = 4096;
	gba.audio.maxSamples = gba.audio.bufferSize << 2;
	gba.audio.buffers = [new Float32Array(gba.audio.maxSamples),new Float32Array(gba.audio.maxSamples)];
	gba.audio.sampleMask = gba.audio.maxSamples-1;
	if(gba.audio.context.createScriptProcessor) gba.audio.jsAudio = gba.audio.context.createScriptProcessor(gba.audio.bufferSize);
	else gba.audio.jsAudio = gba.audio.context.createJavaScriptNode(gba.audio.bufferSize);
	gba.audio.jsAudio.onaudioprocess = e => gba.audio.audioProcess(e);
	
	const biosBuffer = await core.make("osjs/vfs").readfile(proc.settings.bios,"arraybuffer");
	gba.setBios(biosBuffer);
	
	const loadROM = async file => {
		const data = await core.make("osjs/vfs").readfile(file,"arraybuffer");
		try {
			gba.setRom(data);
		} catch(ex) {
			core.make("osjs/dialog","alert",{ message: ex.message, title: ex.name },(btn,value) => {});
		}
	};
	
	const loadSaveData = async file => {
		const data = await core.make("osjs/vfs").readfile(file,"arraybuffer");
		try {
			gba.setSavedata(data);
		} catch(ex) {
			core.make("osjs/dialog","alert",{ message: ex.message, title: ex.name },(btn,value) => {});
		}
	};
	
	var running = false;
	
	proc.createWindow({
		id: "GBAWindow",
		title: metadata.title.en_EN+" (0 FPS)",
		dimension: {width: 240, height: 200},
		icon: proc.resource(metadata.icon),
		position: {left: 700, top: 200},
		attributes: { minDimension: { width: 240, height: 200 } }
	})
	.on("destroy",() => {
		if(running) gba.pause();
		proc.destroy();
	})
	.on("keydown",ev => gba.keypad.keyboardHandler(ev))
	.on("keyup",ev => gba.keypad.keyboardHandler(ev))
	.on("resized",dimension => {
		dimension.height -= 60;
		canvas.style.width = dimension.width+"px";
		canvas.style.height = dimension.height+"px";
	})
	.on("blur",() => {
		running = false;
		gba.pause();
	})
	.on("focus",() => {
		running = true;
		gba.runStable();
	})
	.on("drop",(ev,data) => {
    	if(data.isFile && data.mime) {
			const found = metadata.mimes.find(m => (new RegExp(m)).test(data.mime));
			if(found) loadROM(data);
		}
	})
	.render(($content,win) => {
		gba.reportFPS = fps => {
			win.setTitle(`${metadata.title.en_EN} (FPS: ${fps.toString().substring(0,5)})`);
		};
		canvas.onresize = () => {
			win.setDimension({ width: canvas.width, height: canvas.height });
		};
		window.addEventListener("gamepadconnected",e => gamepadHandler(e,true),true);
		window.addEventListener("mozgamepadconnected",e => gamepadHandler(e,true),true);
		
		window.addEventListener("gamepaddisconnected",e => gamepadHandler(e,false),true);
		window.addEventListener("mozgamepaddisconnected",e => gamepadHandler(e,false),true);
		app({
		},{
			menuFile: ev => (state,actions) => {
				core.make("osjs/contextmenu").show({
					position: ev.target,
					menu: [
						{ label: "Open ROM", onclick: () => {
							core.make("osjs/dialog","file",{ type: "open", mime: metadata.mimes },(btn,item) => {
								if(btn == "ok") loadROM(item);
							});
						} },
						{ label: "Load Save", onclick: () => {
							core.make("osjs/dialog","file",{ type: "open", mime: metadata.mimes },(btn,item) => {
								if(btn == "ok") loadSaveData(item);
							});
						} },
						{ label: "Quit", onclick: () => proc.destroy() }
					]
				});
			},
			menuEmulation: ev => (state,actions) => {
				core.make("osjs/contextmenu").show({
					position: ev.target,
					menu: [
						{ label: !running ? "Start" : "Stop", onclick: !running ? () => {
							running = true;
							gba.runStable();
						} : () => {
							running = false;
							gba.pause();
						} },
						{ label: "Reset", onclick: () => gba.reset() },
						{ label: "Step", onclick: () => gba.step() }
					]
				});
			}
		},(state,actions) => h(Box,{ grow: 1, padding: false },[
			h(Menubar,{},[
				h(MenubarItem,{ onclick: ev => actions.menuFile(ev) },"File"),
				h(MenubarItem,{ onclick: ev => actions.menuEmulation(ev) },"Emulation")
			]),
			h("div",{ oncreate: el => el.appendChild(canvas) })
		]),$content);
		if(proc.args.file) loadROM(proc.args.file);
	});
};

const register = (core,args,options,metadata) => {
	const proc = core.make("osjs/application",{args,options,metadata});
	if(typeof(proc.settings.bios) == "undefined") {
		core.make("osjs/dialog","file",{ type: "open", mime: metadata.mimes, title: "Select GBA BIOS" },(btn,item) => {
			if(btn == "ok") {
				proc.settings.bios = item.path;
				proc.saveSettings().then(() => createWindow(proc,core,metadata)).catch(err => {
					core.make("osjs/dialog","alert",{ message: err.message, title: err.name },(btn,value) => {});
				});
			} else proc.destroy();
		});
	} else createWindow(proc,core,metadata);
	return proc;
};

osjs.register(applicationName,register);
