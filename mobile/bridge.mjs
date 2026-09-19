import {Capacitor,registerPlugin,CapacitorHttp} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import {App} from '@capacitor/app';
const BackgroundGeolocation=registerPlugin('BackgroundGeolocation');
let watcher=null,starting=false;
window.FamilyNative={available:Capacitor.isNativePlatform(),
 async request(path,options){const origin=location.origin;const r=await CapacitorHttp.request({url:new URL(path,origin).href,method:options.method,headers:{...options.headers,Origin:origin},...(options.body?{data:JSON.parse(options.body)}:{}),responseType:'json',connectTimeout:15000,readTimeout:30000});return new Response(JSON.stringify(r.data),{status:r.status,headers:{'Content-Type':'application/json'}});},
 async startLocation(onLocation,onError,background){if(starting||watcher)throw Error('Konum paylaşımı zaten açık.');starting=true;try{if(background&&Capacitor.getPlatform()==='android'){const permission=await LocalNotifications.requestPermissions();if(permission.display!=='granted')throw Error('Arka plan paylaşımı için bildirim izni gerekiyor.');}watcher=await BackgroundGeolocation.addWatcher({requestPermissions:true,stale:false,distanceFilter:50,...(background?{backgroundTitle:'Sarıçiçek · Konum paylaşımı açık',backgroundMessage:'Ailen konumunu görebiliyor. Durdurmak için uygulamayı aç.'}:{})},(position,error)=>{if(error){onError(Error(error.code==='NOT_AUTHORIZED'?'Konum izni kapatıldı. Paylaşımı yeniden başlatmak için cihaz ayarlarını kontrol et.':'Konum güncellenemedi.'));if(error.code==='NOT_AUTHORIZED')window.dispatchEvent(new Event('family-location-revoked'));return;}onLocation(position);});}finally{starting=false;}},
 async stopLocation(){if(watcher){const id=watcher;watcher=null;await BackgroundGeolocation.removeWatcher({id});}},
 async scheduleReminders(events){const permission=await LocalNotifications.requestPermissions();if(permission.display!=='granted')throw Error('Hatırlatmalar için bildirim izni gerekiyor.');const existing=await LocalNotifications.getPending();if(existing.notifications.length)await LocalNotifications.cancel(existing);const list=events.filter(e=>new Date(e.date+'T09:00:00').getTime()>Date.now()).slice(0,48);await LocalNotifications.schedule({notifications:list.map((e,i)=>({id:i+1,title:'Sarıçiçek · Aile takvimi',body:e.title,schedule:{at:new Date(e.date+'T09:00:00')},extra:{page:'calendar'}}))});}
};
if(Capacitor.isNativePlatform()){
 App.addListener('backButton',()=>{const dialog=document.querySelector('dialog[open]');if(dialog)dialog.close();else if(location.hash&&location.hash!=='#home')location.hash='home';else App.minimizeApp();});
 LocalNotifications.addListener('localNotificationActionPerformed',()=>{location.hash='calendar';});
}
