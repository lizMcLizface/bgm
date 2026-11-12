use std::{env,fs,path::PathBuf};
fn replace_once(text:String,from:&str,to:&str)->String{assert_eq!(text.matches(from).count(),1,"accepted source anchor changed");text.replacen(from,to,1)}
fn main(){
 let manifest=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
 let original=manifest.join("../ambience-spatial/src");
 let out=PathBuf::from(env::var("OUT_DIR").unwrap());
 let generated=out.join("ambience-spatial/src");fs::create_dir_all(&generated).unwrap();
 for entry in fs::read_dir(&original).unwrap(){let source=entry.unwrap().path();if source.extension().is_none_or(|v|v!="rs"){continue;}
  println!("cargo:rerun-if-changed={}",source.display());
  let name=source.file_name().unwrap();
  if name=="lib.rs"{let text=fs::read_to_string(&source).unwrap();let mut text=text.lines().map(|line|line.strip_prefix("//!").map_or(line.to_string(),|rest|format!("//{rest}"))).collect::<Vec<_>>().join("\n");text=replace_once(text,"live_observed:f64}","live_observed:f64,topology_width_mask:u32}");text=replace_once(text,"live_observed:0.}","live_observed:0.,topology_width_mask:63}");text=replace_once(text,"for k in 0..9{if k<3","for k in 0..9{if (3..7).contains(&k)&&self.topology_width_mask&(1<<l)==0{continue;}if k<3");text.push_str("\nmod topology;\n");fs::write(generated.join(name),text).unwrap();}
  else if name=="live_resources.rs"{let text=fs::read_to_string(&source).unwrap();let text=replace_once(text,"self.offset=offset;self.live_observed=frame;","self.topology_width_mask=63;self.offset=offset;self.live_observed=frame;");fs::write(generated.join(name),text).unwrap();}
  else{fs::copy(&source,generated.join(name)).unwrap();}
 }
 let extension=manifest.join("src/topology.rs");println!("cargo:rerun-if-changed={}",extension.display());fs::copy(extension,generated.join("topology.rs")).unwrap();
 let resources=out.join("tape-fx/resources");fs::create_dir_all(&resources).unwrap();
 for n in [2048,4096,16384]{let name=format!("chromium-sine-{n}.f32");let source=manifest.join("../tape-fx/resources").join(&name);println!("cargo:rerun-if-changed={}",source.display());fs::copy(source,resources.join(name)).unwrap();}
}
