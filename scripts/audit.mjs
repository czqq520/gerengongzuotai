import {readFile,writeFile,unlink} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {transformWithOxc} from 'vite';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','localStorage','sessionStorage','DOMParser','CustomEvent','HTMLElement','Node','MutationObserver'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');
const {render,fireEvent,screen,cleanup,waitFor}=await import('@testing-library/react');
const temporary=new URL('../src/.audit-runtime.mjs',import.meta.url);
let source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
source=source.replace(/^import '\.\/.*\.css';\r?\n/gm,'').replace("createRoot(document.getElementById('root')).render(<App/>);",'export {Module,BookmarksPage,NoteComposer,Calendar,DataEditor,load};');
const compiled=await transformWithOxc(source,'audit.jsx',{jsx:{runtime:'automatic'}});
await writeFile(temporary,compiled.code);
let passed=0;
const test=async(label,fn)=>{cleanup();localStorage.clear();await fn();passed++;console.log('PASS '+label)};
try{
 const {Module,BookmarksPage,NoteComposer,Calendar,DataEditor,load}=await import(temporary.href+'?t='+Date.now());
 for(const name of ['任务','笔记','发现'])await test(name+'：渲染、删除取消和确认',async()=>{
  const key=name==='任务'?'tasks':name==='笔记'?'notes':'discoveries';
  localStorage.setItem('desk-'+key,JSON.stringify([{id:'one',title:'测试内容',content:'正文'}]));
  render(React.createElement(Module,{name,open:()=>{}}));
  if(name==='笔记')fireEvent.click(screen.getByRole('button',{name:'编辑笔记'}));
  fireEvent.click(screen.getByRole('button',{name:'删除',exact:true}));
  fireEvent.keyDown(window,{key:'Escape'});assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(screen.getByRole('button',{name:'删除',exact:true}));
  fireEvent.keyDown(window,{key:'Enter'});
  assert.equal(load(key).length,0);
 });
 await test('书签：编辑模式、单一分类字段、删除键盘确认',async()=>{
  render(React.createElement(BookmarksPage));
  fireEvent.click(screen.getByRole('button',{name:'编辑书签',exact:true}));
  fireEvent.click(screen.getByTitle('编辑书签'));
  assert.equal(screen.getAllByRole('combobox').length,1);
  fireEvent.click(screen.getByRole('button',{name:'关闭',exact:true}));
  fireEvent.click(screen.getByTitle('删除书签'));fireEvent.keyDown(window,{key:'Escape'});
  assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(screen.getByTitle('删除书签'));fireEvent.keyDown(window,{key:'Enter'});
  assert.equal(load('bookmarks').length,0);
 });
 await test('笔记分类：重命名、删除且保留内容',async()=>{
  localStorage.setItem('desk-notes',JSON.stringify([{id:1,title:'分类测试',folder:'旧分类'}]));
  render(React.createElement(Module,{name:'笔记',open:()=>{}}));
  fireEvent.click(screen.getByRole('button',{name:/旧分类/}));
  fireEvent.click(screen.getByRole('button',{name:'重命名笔记分类'}));
  fireEvent.change(screen.getByLabelText('分类名称'),{target:{value:'新分类'}});
  fireEvent.click(screen.getByRole('button',{name:'保存修改'}));assert.equal(load('notes')[0].folder,'新分类');
  fireEvent.click(screen.getByRole('button',{name:'删除笔记分类'}));fireEvent.keyDown(window,{key:'Enter'});
  assert.equal(load('notes')[0].folder,'未分类');assert.equal(load('notes').length,1);
 });
 await test('笔记编辑器：读取文件夹、格式插入、预览及保存',async()=>{
  localStorage.setItem('desk-note-folders',JSON.stringify(['工作']));let saved;
  render(React.createElement(NoteComposer,{note:{title:'测试'},onSave:value=>saved=value,onClose:()=>{}}));
  fireEvent.change(screen.getByLabelText('文件夹'),{target:{value:'工作'}});
  fireEvent.click(screen.getByRole('button',{name:'加粗'}));
  fireEvent.click(screen.getByRole('button',{name:'预览',exact:true}));assert.ok(document.querySelector('.note-markdown-preview strong'));
  fireEvent.click(screen.getByRole('button',{name:'保存笔记'}));assert.equal(saved.folder,'工作');assert.equal(saved.content,'**文字**');
 });
 await test('任务：新增、编辑和完成状态持久化',async()=>{
  render(React.createElement(DataEditor,{type:'task',close:()=>{}}));
  fireEvent.change(screen.getByLabelText('任务名称'),{target:{value:'新增任务测试'}});fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));
  assert.ok(load('tasks').some(x=>x.title==='新增任务测试'));cleanup();
  render(React.createElement(Module,{name:'任务',open:()=>{}}));
  fireEvent.click(screen.getAllByRole('button',{name:'标记完成'})[0]);assert.equal(load('tasks')[0].done,true);
  fireEvent.click(screen.getAllByRole('button',{name:'编辑',exact:true})[0]);fireEvent.change(screen.getByLabelText('任务名称'),{target:{value:'编辑任务测试'}});fireEvent.click(screen.getByRole('button',{name:'保存修改'}));assert.equal(load('tasks')[0].title,'编辑任务测试');
 });
 await test('笔记分类：新建空分类与重复名称验证',async()=>{
  render(React.createElement(Module,{name:'笔记',open:()=>{}}));fireEvent.click(screen.getByRole('button',{name:'新建分类'}));
  fireEvent.change(screen.getByLabelText('分类名称'),{target:{value:'测试文件夹'}});fireEvent.click(screen.getByRole('button',{name:'创建分类'}));
  assert.deepEqual(JSON.parse(localStorage.getItem('desk-note-folders')),['测试文件夹']);
  fireEvent.click(screen.getByRole('button',{name:'新建分类'}));fireEvent.change(screen.getByLabelText('分类名称'),{target:{value:'测试文件夹'}});fireEvent.click(screen.getByRole('button',{name:'创建分类'}));assert.ok(screen.getByRole('alert'));
 });
 await test('书签：新增、网址校验及分类保存',async()=>{
  render(React.createElement(BookmarksPage));fireEvent.click(screen.getByRole('button',{name:'新增书签'}));
  fireEvent.change(screen.getByLabelText('名称'),{target:{value:'审查书签'}});fireEvent.change(screen.getByLabelText('网址'),{target:{value:'invalid'}});fireEvent.click(screen.getByRole('button',{name:'保存书签'}));assert.ok(screen.getByText(/请输入有效的网址/));
  fireEvent.change(screen.getByLabelText('网址'),{target:{value:'example.com'}});fireEvent.change(screen.getByLabelText('分类'),{target:{value:'工具'}});fireEvent.click(screen.getByRole('button',{name:'保存书签'}));assert.ok(load('bookmarks').some(x=>x.url==='https://example.com/'&&x.category==='工具'));
 });
 await test('月历：跨年翻页、回到本月',async()=>{
  render(React.createElement(Calendar));for(let i=0;i<12;i++)fireEvent.click(screen.getByRole('button',{name:'下个月'}));
  assert.ok(document.querySelector('.calendar-navigation').textContent.includes(String(new Date().getFullYear()+1))); 
  fireEvent.click(screen.getByRole('button',{name:'本月'}));assert.equal(screen.getByRole('button',{name:'本月'}).disabled,true);
 });
 await test('发现：RSS 成功刷新及去重，不发生非法 Hook 调用',async()=>{
  globalThis.fetch=async()=>({ok:true,text:async()=>'<rss><channel><item><title>RSS 测试</title><link>https://example.com/a</link></item></channel></rss>'});
  render(React.createElement(Module,{name:'发现',open:()=>{}}));
  fireEvent.click(screen.getByRole('button',{name:'刷新 RSS'}));await waitFor(()=>assert.equal(load('discoveries').length,1));
  await waitFor(()=>assert.equal(screen.getByRole('button',{name:'刷新 RSS'}).disabled,false));
  fireEvent.click(screen.getByRole('button',{name:'刷新 RSS'}));await waitFor(()=>assert.equal(screen.getByRole('button',{name:'刷新 RSS'}).disabled,false));assert.equal(load('discoveries').length,1);
 });
 await test('损坏的列表存储：可恢复渲染',async()=>{localStorage.setItem('desk-notes','broken json');render(React.createElement(Module,{name:'笔记',open:()=>{}}));assert.ok(screen.getByText('全部笔记'));});
 console.log(`Completed ${passed} checks (DOM simulation; not browser visual verification).`);
}finally{cleanup();await unlink(temporary);dom.window.close()}
