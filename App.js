import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  TextInput, StyleSheet, Dimensions, Alert,
  StatusBar, Animated, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

const { width: SW } = Dimensions.get('window');

// ─── constants ────────────────────────────────────────────────────────────────
const TAB_KEYS   = ['theory', 'practical', 'posting'];
const TAB_LABELS = ['Theory', 'Practical', 'Posting'];
const STORAGE_KEY = 'attendance_tracker_v1';
const CAL_KEY     = 'attendance_calendar_v1';

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'];

const DEFAULT_DATA = {
  theory: [
    { id:'t1', name:'Pathology',    attended:32, missed:17, req:75 },
    { id:'t2', name:'Microbiology', attended:34, missed:18, req:75 },
    { id:'t3', name:'Pharma',       attended:0,  missed:0,  req:75 },
    { id:'t4', name:'Medicine',     attended:8,  missed:3,  req:75 },
  ],
  practical: [
    { id:'p1', name:'Fluid Lab', attended:10, missed:2, req:75 },
    { id:'p2', name:'MMI Lab',   attended:8,  missed:1, req:75 },
  ],
  posting: [
    { id:'po1', name:'Ward Posting', attended:5, missed:1, req:80 },
  ],
};

// ─── helpers ──────────────────────────────────────────────────────────────────
const calcPct = (a, t) => (t === 0 ? 0 : Math.round((a / t) * 100));

const getInsight = (attended, missed, req) => {
  const total = attended + missed;
  const pct   = calcPct(attended, total);
  if (total === 0 || req === 0) return { text: "Can't miss any class", color: '#f59e0b' };
  if (pct >= req) {
    const canMiss = Math.floor((attended * 100) / req - total);
    if (canMiss <= 0) return { text: "Can't miss any class", color: '#f59e0b' };
    return { text: `You can miss ${canMiss} more class${canMiss > 1 ? 'es' : ''}`, color: '#22c55e' };
  } else {
    const need = Math.ceil((req * total / 100 - attended) / (1 - req / 100));
    return { text: `Attend ${need} class${need !== 1 ? 'es' : ''} in a row`, color: '#ef4444' };
  }
};

const TODAY      = new Date();
const formatDate = (d) => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
const formatDay  = (d) => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];

// ─── storage ──────────────────────────────────────────────────────────────────
async function loadSubjects() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_DATA;
}
async function saveSubjects(data) {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
async function loadCalendar() {
  try {
    const raw = await AsyncStorage.getItem(CAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}
async function saveCalendar(data) {
  try { await AsyncStorage.setItem(CAL_KEY, JSON.stringify(data)); } catch {}
}

// ─── CircularProgress ─────────────────────────────────────────────────────────
function CircularProgress({ pct, req, size = 68 }) {
  const r     = (size - 10) / 2;
  const circ  = 2 * Math.PI * r;
  const dash  = Math.min(pct / 100, 1) * circ;
  const good  = req === 0 ? true : pct >= req;
  const color = good ? '#22c55e' : '#ef4444';
  return (
    <Svg width={size} height={size} style={{ transform:[{rotate:'-90deg'}] }}>
      <Circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1f2e" strokeWidth={8}/>
      <Circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"/>
      <SvgText x="50%" y="50%" textAnchor="middle" dy="5"
        fill={color} fontSize={13} fontWeight="bold"
        transform={`rotate(90, ${size/2}, ${size/2})`}>
        {pct}%
      </SvgText>
    </Svg>
  );
}

// ─── Counter Row ──────────────────────────────────────────────────────────────
function CounterRow({ label, value, color, onDec, onInc }) {
  return (
    <View style={s.counterWrap}>
      <Text style={[s.counterLabel, {color}]}>{label}</Text>
      <View style={s.counterRow}>
        <TouchableOpacity style={[s.cBtn, {borderColor: color+'55'}]} onPress={onDec}>
          <Text style={[s.cBtnTxt, {color}]}>−</Text>
        </TouchableOpacity>
        <Text style={[s.cVal, {color}]}>{value}</Text>
        <TouchableOpacity style={[s.cBtn, {borderColor: color+'55'}]} onPress={onInc}>
          <Text style={[s.cBtnTxt, {color}]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Calendar Modal ───────────────────────────────────────────────────────────
function CalendarModal({ visible, subjectId, subjectName, calData, onCalChange, onClose }) {
  const [year,  setYear]  = useState(TODAY.getFullYear());
  const [month, setMonth] = useState(TODAY.getMonth());
  const [sel,   setSel]   = useState(null);
  const [form,  setForm]  = useState({ attended:0, missed:0 });

  const days  = new Date(year, month + 1, 0).getDate();
  const first = new Date(year, month, 1).getDay();
  const key   = (d) => `${subjectId}_${year}-${month+1}-${d}`;

  const dotColor = (d) => {
    const v = calData[key(d)];
    if (!v) return null;
    if (v.attended > 0 && v.missed === 0) return '#22c55e';
    if (v.missed   > 0 && v.attended === 0) return '#ef4444';
    if (v.attended > 0 && v.missed   > 0) return '#f59e0b';
    return null;
  };

  const prev = () => { if(month===0){setMonth(11);setYear(y=>y-1)} else setMonth(m=>m-1); };
  const next = () => { if(month===11){setMonth(0);setYear(y=>y+1)} else setMonth(m=>m+1); };

  const cells = [...Array(first).fill(null), ...Array.from({length:days},(_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const saveDay = () => {
    onCalChange({ ...calData, [key(sel)]: form });
    setSel(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.overlayBg} onPress={onClose}/>
        <View style={s.sheet}>
          <View style={s.dragHandle}/>
          <Text style={s.sheetTitle}>{subjectName}</Text>
          <Text style={s.sheetSub}>Attendance Activity</Text>

          {/* legend */}
          <View style={s.legendRow}>
            {[['#22c55e','Present'],['#ef4444','Absent'],['#f59e0b','Mixed'],['#475569','Off-day']].map(([c,l])=>(
              <View key={l} style={s.legendItem}>
                <View style={[s.legendDot, {backgroundColor:c}]}/>
                <Text style={s.legendTxt}>{l}</Text>
              </View>
            ))}
          </View>
          <Text style={s.tapHint}>Tap on date to enter attendance</Text>

          {/* month nav */}
          <View style={s.calNav}>
            <TouchableOpacity style={s.calNavBtn} onPress={prev}>
              <Text style={s.calNavTxt}>‹</Text>
            </TouchableOpacity>
            <Text style={s.calNavTitle}>{MONTH_NAMES[month]} {year}</Text>
            <TouchableOpacity style={s.calNavBtn} onPress={next}>
              <Text style={s.calNavTxt}>›</Text>
            </TouchableOpacity>
          </View>

          {/* calendar grid */}
          <View style={s.calGrid}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>(
              <Text key={d} style={s.calDayHead}>{d}</Text>
            ))}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={s.calCell}/>;
              const dot     = dotColor(d);
              const isToday = d===TODAY.getDate() && month===TODAY.getMonth() && year===TODAY.getFullYear();
              return (
                <TouchableOpacity key={d} style={[
                  s.calCell,
                  dot     ? {backgroundColor: dot+'33'} : {backgroundColor:'#1e293b'},
                  isToday ? {borderWidth:1.5, borderColor:'#6366f1'} : {},
                ]} onPress={()=>{setSel(d);setForm(calData[key(d)]||{attended:0,missed:0});}}>
                  <Text style={[s.calDayTxt,{color: dot||(isToday?'#818cf8':'#64748b'),fontWeight:isToday?'800':'500'}]}>{d}</Text>
                  {dot && <View style={[s.calDot, {backgroundColor:dot}]}/>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* day editor */}
          {sel !== null && (
            <View style={s.dayEditor}>
              <Text style={s.dayEditorTitle}>{MONTH_NAMES[month]} {sel}, {year}</Text>
              <View style={{flexDirection:'row', gap:10, marginBottom:10}}>
                <CounterRow label="Attended" value={form.attended} color="#22c55e"
                  onDec={()=>setForm(f=>({...f,attended:Math.max(0,f.attended-1)}))}
                  onInc={()=>setForm(f=>({...f,attended:f.attended+1}))}/>
                <CounterRow label="Missed" value={form.missed} color="#ef4444"
                  onDec={()=>setForm(f=>({...f,missed:Math.max(0,f.missed-1)}))}
                  onInc={()=>setForm(f=>({...f,missed:f.missed+1}))}/>
              </View>
              <View style={{flexDirection:'row', gap:8, marginBottom:10}}>
                {[['✓ Present','#22c55e',{attended:1,missed:0}],
                  ['✗ Absent','#ef4444',{attended:0,missed:1}],
                  ['Clear','#475569',{attended:0,missed:0}]].map(([l,c,v])=>(
                  <TouchableOpacity key={l} style={[s.quickBtn,{borderColor:c+'44',backgroundColor:c+'18'}]} onPress={()=>setForm(v)}>
                    <Text style={[s.quickBtnTxt,{color:c}]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={s.saveBtn} onPress={saveDay}>
                <Text style={s.saveBtnTxt}>Save</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ visible, subj, tabKey, onSave, onDelete, onClose }) {
  const [catIdx, setCatIdx] = useState(TAB_KEYS.indexOf(tabKey));
  const [name,   setName]   = useState(subj?.name || '');
  const [att,    setAtt]    = useState(subj?.attended || 0);
  const [miss,   setMiss]   = useState(subj?.missed || 0);
  const [req,    setReq]    = useState(subj?.req || 75);

  useEffect(() => {
    if (subj) {
      setCatIdx(TAB_KEYS.indexOf(tabKey));
      setName(subj.name);
      setAtt(subj.attended);
      setMiss(subj.missed);
      setReq(subj.req);
    }
  }, [subj, tabKey]);

  const handleDelete = () => {
    Alert.alert('Delete Subject', `Delete "${subj?.name}"?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress:()=>onDelete(subj.id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.overlayBg} onPress={onClose}/>
        <ScrollView style={s.sheet} contentContainerStyle={{paddingBottom:40}}>
          <View style={s.dragHandle}/>
          <Text style={s.sheetTitle}>Update Attendance</Text>

          <View style={s.tipBox}>
            <Text style={s.tipTxt}>• <Text style={{color:'#e2e8f0',fontWeight:'700'}}>Swipe</Text> card right to Delete{'\n'}• <Text style={{color:'#e2e8f0',fontWeight:'700'}}>Long-press</Text> card to Reorder</Text>
          </View>

          <Text style={s.fieldLabel}>Category</Text>
          <View style={s.catRow}>
            {TAB_LABELS.map((l,i)=>(
              <TouchableOpacity key={l} style={[s.catBtn, catIdx===i && s.catBtnActive]} onPress={()=>setCatIdx(i)}>
                <Text style={[s.catBtnTxt, catIdx===i && s.catBtnTxtActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>Enter subject</Text>
          <View style={s.inputRow}>
            <Text style={s.inputIcon}>📊</Text>
            <TextInput value={name} onChangeText={setName}
              style={s.textInput} placeholderTextColor="#475569" placeholder="Subject name"/>
          </View>

          <Text style={s.fieldLabel}>Classes attended</Text>
          <View style={s.inputRow}>
            <Text style={s.inputIcon}>✅</Text>
            <Text style={[s.inputLabel,{color:'#60a5fa'}]}>Attended</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#3b82f644',marginLeft:'auto'}]} onPress={()=>setAtt(a=>Math.max(0,a-1))}>
              <Text style={[s.cBtnTxt,{color:'#60a5fa'}]}>−</Text>
            </TouchableOpacity>
            <Text style={[s.cVal,{color:'#f1f5f9',minWidth:48,textAlign:'center'}]}>{att}</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#3b82f644'}]} onPress={()=>setAtt(a=>a+1)}>
              <Text style={[s.cBtnTxt,{color:'#60a5fa'}]}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.fieldLabel}>Classes missed</Text>
          <View style={s.inputRow}>
            <Text style={s.inputIcon}>❌</Text>
            <Text style={[s.inputLabel,{color:'#f87171'}]}>Missed</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#ef444444',marginLeft:'auto'}]} onPress={()=>setMiss(m=>Math.max(0,m-1))}>
              <Text style={[s.cBtnTxt,{color:'#f87171'}]}>−</Text>
            </TouchableOpacity>
            <Text style={[s.cVal,{color:'#f1f5f9',minWidth:48,textAlign:'center'}]}>{miss}</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#ef444444'}]} onPress={()=>setMiss(m=>m+1)}>
              <Text style={[s.cBtnTxt,{color:'#f87171'}]}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.fieldLabel}>Required %</Text>
          <View style={s.inputRow}>
            <Text style={s.inputIcon}>📋</Text>
            <Text style={[s.inputLabel,{color:'#94a3b8'}]}>Required</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#47556944',marginLeft:'auto'}]} onPress={()=>setReq(r=>Math.max(0,r-5))}>
              <Text style={[s.cBtnTxt,{color:'#94a3b8'}]}>−</Text>
            </TouchableOpacity>
            <Text style={[s.cVal,{color:'#f1f5f9',minWidth:60,textAlign:'center'}]}>{req} %</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#47556944'}]} onPress={()=>setReq(r=>Math.min(100,r+5))}>
              <Text style={[s.cBtnTxt,{color:'#94a3b8'}]}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={{flexDirection:'row',gap:10,marginTop:10}}>
            <TouchableOpacity style={[s.actionBtn,{backgroundColor:'#ef4444'}]} onPress={handleDelete}>
              <Text style={s.actionBtnTxt}>🗑 Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn,{backgroundColor:'#3b82f6'}]}
              onPress={()=>onSave({...subj,name,attended:att,missed:miss,req}, TAB_KEYS[catIdx])}>
              <Text style={s.actionBtnTxt}>↻ Update</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Add Modal ────────────────────────────────────────────────────────────────
function AddModal({ visible, tabKey, onAdd, onClose }) {
  const [catIdx, setCatIdx] = useState(TAB_KEYS.indexOf(tabKey));
  const [name,   setName]   = useState('');
  const [att,    setAtt]    = useState(0);
  const [miss,   setMiss]   = useState(0);
  const [req,    setReq]    = useState(75);

  useEffect(() => { if(visible){ setName('');setAtt(0);setMiss(0);setReq(75); } }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.overlayBg} onPress={onClose}/>
        <ScrollView style={s.sheet} contentContainerStyle={{paddingBottom:40}}>
          <View style={s.dragHandle}/>
          <Text style={s.sheetTitle}>Add Subject</Text>

          <Text style={s.fieldLabel}>Category</Text>
          <View style={s.catRow}>
            {TAB_LABELS.map((l,i)=>(
              <TouchableOpacity key={l} style={[s.catBtn, catIdx===i && s.catBtnActive]} onPress={()=>setCatIdx(i)}>
                <Text style={[s.catBtnTxt, catIdx===i && s.catBtnTxtActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>Subject name</Text>
          <View style={s.inputRow}>
            <Text style={s.inputIcon}>📊</Text>
            <TextInput value={name} onChangeText={setName}
              style={s.textInput} placeholderTextColor="#475569" placeholder="e.g. Pathology"/>
          </View>

          {[['Classes attended','✅','#60a5fa',att,setAtt,'#3b82f644'],
            ['Classes missed','❌','#f87171',miss,setMiss,'#ef444444'],
          ].map(([lbl,ico,c,v,sv,bc])=>(
            <View key={lbl}>
              <Text style={s.fieldLabel}>{lbl}</Text>
              <View style={s.inputRow}>
                <Text style={s.inputIcon}>{ico}</Text>
                <TouchableOpacity style={[s.cBtn,{borderColor:bc,marginLeft:'auto'}]} onPress={()=>sv(x=>Math.max(0,x-1))}>
                  <Text style={[s.cBtnTxt,{color:c}]}>−</Text>
                </TouchableOpacity>
                <Text style={[s.cVal,{color:'#f1f5f9',minWidth:48,textAlign:'center'}]}>{v}</Text>
                <TouchableOpacity style={[s.cBtn,{borderColor:bc}]} onPress={()=>sv(x=>x+1)}>
                  <Text style={[s.cBtnTxt,{color:c}]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <Text style={s.fieldLabel}>Required %</Text>
          <View style={s.inputRow}>
            <Text style={s.inputIcon}>📋</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#47556944',marginLeft:'auto'}]} onPress={()=>setReq(r=>Math.max(0,r-5))}>
              <Text style={[s.cBtnTxt,{color:'#94a3b8'}]}>−</Text>
            </TouchableOpacity>
            <Text style={[s.cVal,{color:'#f1f5f9',minWidth:60,textAlign:'center'}]}>{req} %</Text>
            <TouchableOpacity style={[s.cBtn,{borderColor:'#47556944'}]} onPress={()=>setReq(r=>Math.min(100,r+5))}>
              <Text style={[s.cBtnTxt,{color:'#94a3b8'}]}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={{flexDirection:'row',gap:10,marginTop:10}}>
            <TouchableOpacity style={[s.actionBtn,{backgroundColor:'#1e293b',borderWidth:1,borderColor:'#334155'}]} onPress={onClose}>
              <Text style={[s.actionBtnTxt,{color:'#64748b'}]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn,{backgroundColor:'#3b82f6'}]}
              onPress={()=>{
                if(!name.trim()) return;
                onAdd({id:`s${Date.now()}`,name:name.trim(),attended:att,missed:miss,req}, TAB_KEYS[catIdx]);
                onClose();
              }}>
              <Text style={s.actionBtnTxt}>Add Subject</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Subject Card ─────────────────────────────────────────────────────────────
function SubjectCard({ subj, tabKey, idx, calData, onUpdate, onDelete, onMoveUp, onCalChange }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showCal,  setShowCal]  = useState(false);
  const [expanded, setExpanded] = useState(false);

  const total = subj.attended + subj.missed;
  const pct   = calcPct(subj.attended, total);
  const ins   = getInsight(subj.attended, subj.missed, subj.req);
  const bump  = (f, d) => onUpdate({ ...subj, [f]: Math.max(0, subj[f] + d) });

  const lpRef = useRef(null);
  const onLPS = () => { lpRef.current = setTimeout(() => onMoveUp(), 600); };
  const onLPE = () => clearTimeout(lpRef.current);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.95}
        style={s.card}
        onLongPress={onMoveUp}
        delayLongPress={600}
      >
        <View style={s.cardTop}>
          <TouchableOpacity onPress={()=>setExpanded(e=>!e)}>
            <CircularProgress pct={pct} req={subj.req}/>
          </TouchableOpacity>

          <TouchableOpacity style={{flex:1,marginLeft:12}} onPress={()=>setExpanded(e=>!e)}>
            <Text style={s.cardName}>{subj.name}</Text>
            <View style={s.tagRow}>
              <Tag label={`Attended: ${subj.attended}`} color="#3b82f6"/>
              <Tag label={`Missed: ${subj.missed}`}     color="#ef4444"/>
              <Tag label={`Req.: ${subj.req}%`}         color="#475569"/>
            </View>
            <Text style={[s.insight,{color:ins.color}]}>{ins.text}</Text>
          </TouchableOpacity>

          <View style={s.cardIcons}>
            <TouchableOpacity style={[s.iconBtn,{backgroundColor:'#22c55e1a',borderColor:'#22c55e33'}]}
              onPress={()=>setShowCal(true)}>
              <Text style={{fontSize:16}}>📅</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn,{backgroundColor:'#3b82f61a',borderColor:'#3b82f633'}]}
              onPress={()=>setShowEdit(true)}>
              <Text style={{fontSize:16}}>✏️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {expanded && (
          <View style={s.expanded}>
            <View style={s.expandedRow}>
              {[['Attended',subj.attended,'#22c55e','attended'],
                ['Missed',subj.missed,'#ef4444','missed']].map(([l,v,c,f])=>(
                <View key={l} style={{flex:1,alignItems:'center'}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:4}}>
                    <TouchableOpacity style={[s.cBtn,{borderColor:c+'44'}]} onPress={()=>bump(f,-1)}>
                      <Text style={[s.cBtnTxt,{color:c}]}>−</Text>
                    </TouchableOpacity>
                    <Text style={[s.cVal,{color:c,minWidth:28,textAlign:'center'}]}>{v}</Text>
                    <TouchableOpacity style={[s.cBtn,{borderColor:c+'44'}]} onPress={()=>bump(f, 1)}>
                      <Text style={[s.cBtnTxt,{color:c}]}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.expandLabel}>{l.toUpperCase()}</Text>
                </View>
              ))}
              <View style={{flex:1,alignItems:'center'}}>
                <Text style={[s.cVal,{color:'#94a3b8',minWidth:28,textAlign:'center',marginBottom:4}]}>{total}</Text>
                <Text style={s.expandLabel}>TOTAL</Text>
              </View>
            </View>
            <View style={{flexDirection:'row',gap:8,marginTop:8}}>
              {[['+ Present','#22c55e','attended'],['+ Absent','#ef4444','missed']].map(([l,c,f])=>(
                <TouchableOpacity key={l} style={[s.quickBtn,{borderColor:c+'44',backgroundColor:c+'18',flex:1}]}
                  onPress={()=>bump(f,1)}>
                  <Text style={[s.quickBtnTxt,{color:c}]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </TouchableOpacity>

      <EditModal visible={showEdit} subj={subj} tabKey={tabKey}
        onSave={(updated, newTab)=>{ onUpdate(updated, newTab); setShowEdit(false); }}
        onDelete={(id)=>{ onDelete(id); setShowEdit(false); }}
        onClose={()=>setShowEdit(false)}/>

      <CalendarModal visible={showCal} subjectId={subj.id} subjectName={subj.name}
        calData={calData} onCalChange={onCalChange} onClose={()=>setShowCal(false)}/>
    </>
  );
}

function Tag({ label, color }) {
  return (
    <View style={[s.tag,{backgroundColor:color+'1a',borderColor:color+'44'}]}>
      <Text style={[s.tagTxt,{color}]}>{label}</Text>
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,      setTab]      = useState(0);
  const [subjects, setSubjects] = useState(DEFAULT_DATA);
  const [calData,  setCalData]  = useState({});
  const [showAdd,  setShowAdd]  = useState(false);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    Promise.all([loadSubjects(), loadCalendar()]).then(([s, c]) => {
      setSubjects(s);
      setCalData(c);
      setReady(true);
    });
  }, []);

  useEffect(() => { if(ready) saveSubjects(subjects); }, [subjects]);
  useEffect(() => { if(ready) saveCalendar(calData);  }, [calData]);

  const key  = TAB_KEYS[tab];
  const list = subjects[key];

  const updateSubject = (updated, newTabKey) => {
    setSubjects(prev => {
      if (newTabKey && newTabKey !== key) {
        return {
          ...prev,
          [key]:       prev[key].filter(s => s.id !== updated.id),
          [newTabKey]: [...prev[newTabKey], updated],
        };
      }
      return { ...prev, [key]: prev[key].map(s => s.id === updated.id ? updated : s) };
    });
  };

  const deleteSubject = (id) =>
    setSubjects(prev => ({ ...prev, [key]: prev[key].filter(s => s.id !== id) }));

  const addSubject = (subj, tabK) =>
    setSubjects(prev => ({ ...prev, [tabK]: [...prev[tabK], subj] }));

  const moveUp = (idx) => {
    if (idx === 0) return;
    setSubjects(prev => {
      const arr = [...prev[key]];
      [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
      return { ...prev, [key]: arr };
    });
  };

  if (!ready) return (
    <View style={{flex:1,backgroundColor:'#000',alignItems:'center',justifyContent:'center'}}>
      <Text style={{color:'#475569',fontSize:16}}>Loading...</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000"/>

      {/* header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Attendance Tracker</Text>
        <TouchableOpacity style={s.addBtn} onPress={()=>setShowAdd(true)}>
          <Text style={s.addBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>

      {/* date pills */}
      <View style={s.datePills}>
        <View style={s.pill}><Text style={s.pillTxt}>{formatDate(TODAY)}</Text></View>
        <View style={s.pill}><Text style={s.pillTxt}>{formatDay(TODAY)}</Text></View>
      </View>

      {/* tabs */}
      <View style={s.tabBar}>
        {TAB_LABELS.map((l,i)=>(
          <TouchableOpacity key={l} style={[s.tabBtn, tab===i && s.tabBtnActive]} onPress={()=>setTab(i)}>
            <Text style={[s.tabBtnTxt, tab===i && s.tabBtnTxtActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* list */}
      <ScrollView style={{flex:1}} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {list.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📚</Text>
            <Text style={s.emptyTxt}>No subjects yet</Text>
            <Text style={s.emptySub}>Tap + to add one</Text>
          </View>
        ) : list.map((subj, i) => (
          <SubjectCard key={subj.id} subj={subj} tabKey={key} idx={i}
            calData={calData}
            onUpdate={updateSubject}
            onDelete={deleteSubject}
            onMoveUp={()=>moveUp(i)}
            onCalChange={setCalData}/>
        ))}
      </ScrollView>

      <AddModal visible={showAdd} tabKey={key} onAdd={addSubject} onClose={()=>setShowAdd(false)}/>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:           { flex:1, backgroundColor:'#000', paddingTop: Platform.OS==='android'?StatusBar.currentHeight:44 },
  header:         { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingBottom:10 },
  headerTitle:    { flex:1, textAlign:'center', color:'#f1f5f9', fontSize:20, fontWeight:'900', letterSpacing:-0.4 },
  addBtn:         { width:34, height:34, borderRadius:10, borderWidth:1.5, borderColor:'#334155', alignItems:'center', justifyContent:'center' },
  addBtnTxt:      { color:'#94a3b8', fontSize:22, lineHeight:26 },
  datePills:      { flexDirection:'row', gap:10, paddingHorizontal:14, marginBottom:10 },
  pill:           { backgroundColor:'#111827', borderWidth:1, borderColor:'#1e293b', borderRadius:10, paddingHorizontal:14, paddingVertical:6 },
  pillTxt:        { color:'#60a5fa', fontSize:14, fontWeight:'700' },
  tabBar:         { flexDirection:'row', backgroundColor:'#111827', borderWidth:1, borderColor:'#1e293b', borderRadius:14, margin:14, marginTop:0, padding:4 },
  tabBtn:         { flex:1, paddingVertical:8, borderRadius:10, alignItems:'center' },
  tabBtnActive:   { backgroundColor:'#f1f5f9' },
  tabBtnTxt:      { color:'#475569', fontWeight:'700', fontSize:13 },
  tabBtnTxtActive:{ color:'#000' },
  list:           { paddingHorizontal:12, paddingBottom:30 },
  empty:          { alignItems:'center', marginTop:80 },
  emptyIcon:      { fontSize:48 },
  emptyTxt:       { color:'#475569', fontWeight:'600', fontSize:16, marginTop:10 },
  emptySub:       { color:'#334155', fontSize:13, marginTop:4 },

  // card
  card:           { backgroundColor:'#111827', borderWidth:1, borderColor:'#1e2d3d', borderRadius:16, padding:14, marginBottom:10, shadowColor:'#000', shadowOpacity:.4, shadowRadius:8, elevation:4 },
  cardTop:        { flexDirection:'row', alignItems:'center' },
  cardName:       { color:'#f1f5f9', fontWeight:'800', fontSize:17, letterSpacing:-0.3, marginBottom:5 },
  tagRow:         { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:6 },
  insight:        { fontSize:13, fontWeight:'700' },
  cardIcons:      { flexDirection:'column', gap:6, alignItems:'center' },
  iconBtn:        { width:32, height:32, borderRadius:8, borderWidth:1, alignItems:'center', justifyContent:'center' },
  expanded:       { marginTop:14, borderTopWidth:1, borderTopColor:'#1e293b', paddingTop:14 },
  expandedRow:    { flexDirection:'row', marginBottom:4 },
  expandLabel:    { fontSize:10, color:'#475569', fontWeight:'700', letterSpacing:0.8 },

  // tag
  tag:            { borderWidth:1, borderRadius:6, paddingHorizontal:8, paddingVertical:2 },
  tagTxt:         { fontSize:12, fontWeight:'700' },

  // counter
  counterWrap:    { flex:1, backgroundColor:'#1e293b', borderRadius:10, padding:10 },
  counterLabel:   { fontSize:11, fontWeight:'600', marginBottom:8 },
  counterRow:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  cBtn:           { width:30, height:30, borderRadius:8, borderWidth:1.5, backgroundColor:'#0f172a', alignItems:'center', justifyContent:'center' },
  cBtnTxt:        { fontSize:18, fontWeight:'700', lineHeight:22 },
  cVal:           { fontSize:20, fontWeight:'800' },

  // quick buttons
  quickBtn:       { flex:1, paddingVertical:8, borderRadius:8, borderWidth:1.5, alignItems:'center' },
  quickBtnTxt:    { fontWeight:'700', fontSize:12 },

  // modals
  overlay:        { flex:1, justifyContent:'flex-end' },
  overlayBg:      { ...StyleSheet.absoluteFillObject, backgroundColor:'#000000bb' },
  sheet:          { backgroundColor:'#111827', borderTopLeftRadius:24, borderTopRightRadius:24, borderWidth:1, borderColor:'#1e293b', padding:16, maxHeight:'92%' },
  dragHandle:     { width:40, height:4, backgroundColor:'#334155', borderRadius:4, alignSelf:'center', marginBottom:14 },
  sheetTitle:     { textAlign:'center', fontWeight:'800', fontSize:18, color:'#f1f5f9', marginBottom:4 },
  sheetSub:       { textAlign:'center', fontSize:12, color:'#475569', marginBottom:10 },

  legendRow:      { flexDirection:'row', flexWrap:'wrap', gap:12, justifyContent:'center', marginBottom:8 },
  legendItem:     { flexDirection:'row', alignItems:'center', gap:5 },
  legendDot:      { width:10, height:10, borderRadius:3 },
  legendTxt:      { fontSize:11, color:'#64748b' },
  tapHint:        { textAlign:'center', fontSize:11, color:'#475569', marginBottom:8 },

  calNav:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  calNavBtn:      { width:32, height:32, backgroundColor:'#1e293b', borderWidth:1, borderColor:'#334155', borderRadius:8, alignItems:'center', justifyContent:'center' },
  calNavTxt:      { color:'#94a3b8', fontSize:20, lineHeight:24 },
  calNavTitle:    { color:'#e2e8f0', fontWeight:'700', fontSize:15 },

  calGrid:        { backgroundColor:'#0f172a', borderRadius:14, padding:10, flexDirection:'row', flexWrap:'wrap' },
  calDayHead:     { width:`${100/7}%`, textAlign:'center', fontSize:10, fontWeight:'700', color:'#334155', paddingBottom:4 },
  calCell:        { width:`${100/7}%`, aspectRatio:1, borderRadius:8, alignItems:'center', justifyContent:'center', padding:2 },
  calDayTxt:      { fontSize:12 },
  calDot:         { width:4, height:4, borderRadius:2, marginTop:1 },

  dayEditor:      { marginTop:14, backgroundColor:'#0f172a', borderRadius:14, padding:14, borderWidth:1, borderColor:'#334155' },
  dayEditorTitle: { fontWeight:'700', color:'#f1f5f9', marginBottom:12, fontSize:14 },

  saveBtn:        { backgroundColor:'#3b82f6', borderRadius:10, padding:12, alignItems:'center' },
  saveBtnTxt:     { color:'#fff', fontWeight:'700', fontSize:14 },
  closeBtn:       { marginTop:12, backgroundColor:'#1e293b', borderWidth:1, borderColor:'#334155', borderRadius:12, padding:12, alignItems:'center' },
  closeBtnTxt:    { color:'#64748b', fontWeight:'600' },

  tipBox:         { backgroundColor:'#0f172a', borderWidth:1.5, borderColor:'#6366f155', borderRadius:10, padding:12, marginBottom:14 },
  tipTxt:         { color:'#94a3b8', fontSize:12, lineHeight:20 },
  fieldLabel:     { fontSize:12, color:'#64748b', fontWeight:'600', marginBottom:6, marginTop:4 },
  inputRow:       { backgroundColor:'#111827', borderWidth:1, borderColor:'#1e293b', borderRadius:10, padding:12, marginBottom:14, flexDirection:'row', alignItems:'center', gap:10 },
  inputIcon:      { fontSize:18 },
  inputLabel:     { fontWeight:'700', fontSize:15 },
  textInput:      { flex:1, color:'#f1f5f9', fontSize:16, fontWeight:'700' },

  catRow:         { flexDirection:'row', gap:8, marginBottom:14, flexWrap:'wrap' },
  catBtn:         { paddingHorizontal:16, paddingVertical:7, borderRadius:8, borderWidth:1.5, borderColor:'#334155' },
  catBtnActive:   { backgroundColor:'#22c55e', borderColor:'#22c55e' },
  catBtnTxt:      { color:'#94a3b8', fontWeight:'700', fontSize:13 },
  catBtnTxtActive:{ color:'#000' },

  actionBtn:      { flex:1, padding:13, borderRadius:12, alignItems:'center' },
  actionBtnTxt:   { color:'#fff', fontWeight:'700', fontSize:15 },
});
