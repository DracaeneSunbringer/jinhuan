import {readFileSync,writeFileSync} from 'node:fs'
const core=readFileSync(new URL('../public/redpacket-providers.js',import.meta.url),'utf8').replace(/^export /gm,'')
const fishCode=readFileSync(new URL('../public/fish-ecoji.js',import.meta.url),'utf8').replace(/^export /gm,'')
const creditCore=readFileSync(new URL('./credit-create-core.js',import.meta.url),'utf8').replace(/^export /gm,'')
const creditPage=readFileSync(new URL('./credit-create-page.js',import.meta.url),'utf8')
const runtime=readFileSync(new URL('./redpacket-helper-runtime.js',import.meta.url),'utf8')
const platformCore=readFileSync(new URL('../public/redpacket-create-core.js',import.meta.url),'utf8').replace(/^export /gm,'')
const platformRuntime=readFileSync(new URL('./platform-create-runtime.js',import.meta.url),'utf8')
const header=`// ==UserScript==
// @name         尽欢红包连接器
// @namespace    https://52dmeme.com/
// @version      1.5.0
// @downloadURL  https://52dmeme.com/meme-redpacket.user.js
// @updateURL    https://52dmeme.com/meme-redpacket.user.js
// @description  用本人登录态查询领取 HB/Credit/fish；Credit 发包仅在其来源页本人确认，不托管积分或登录凭据。
// @match        https://52dmeme.com/*
// @match        https://credit.linux.do/*
// @connect      hb.unsnow.org
// @connect      credit.linux.do
// @connect      hb.lafi.sh
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @license      MIT AND Apache-2.0
// Ecoji V2 映射许可见 https://52dmeme.com/ecoji-LICENSE.txt
// ==/UserScript==
`
writeFileSync(new URL('../public/meme-redpacket.user.js',import.meta.url),header+'\n(()=>{\n"use strict";\n'+core+'\n'+fishCode+'\n'+creditCore+'\n'+creditPage+'\n'+platformCore+'\n'+platformRuntime+'\n'+runtime+'\n})();\n')
console.log('红包辅助脚本已生成；仅固定站点权限')
