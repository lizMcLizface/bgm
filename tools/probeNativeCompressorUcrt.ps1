# Diagnostic translation of the pinned Google/Apple BSD static curve only.
# No process injection/native output fitting: reads ordinary system CRT math.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UcrtCompressorCurve {
 [DllImport("ucrtbase.dll",CallingConvention=CallingConvention.Cdecl)] public static extern float log10f(float x);
 [DllImport("ucrtbase.dll",CallingConvention=CallingConvention.Cdecl)] public static extern float powf(float x,float y);
 [DllImport("ucrtbase.dll",CallingConvention=CallingConvention.Cdecl)] public static extern double exp(double x);
 static float DB(float x){return 20*log10f(x);}
 static float Linear(float x){return powf(10,.05f*x);}
 static float Curve(float x,float k,float threshold){if(x<threshold)return x;return threshold+(1-(float)exp((double)(-k*(x-threshold))))/k;}
 public static double[] Probe(float dbThreshold,float dbKnee,float ratio){
  float threshold=Linear(dbThreshold),dbX=dbThreshold+dbKnee,x=Linear(dbX),x2=1,dbX2=0;
  if(!(x<threshold)){x2=(float)((double)x*1.001);dbX2=DB(x2);}
  float min=.1f,max=10000,k=5;
  for(int i=0;i<15;i++){float slope=1;if(!(x<threshold))slope=(DB(Curve(x2,k,threshold))-DB(Curve(x,k,threshold)))/(dbX2-dbX);if(slope<1/ratio)max=k;else min=k;k=(float)Math.Sqrt(min*max);}
  float yknee=DB(Curve(x,k,threshold)),sat=1<x?Curve(1,k,threshold):Linear(yknee+1/ratio*(0-dbX)),post=(float)Math.Pow(1/sat,.6f);
  return new double[]{k,threshold,x,yknee,post,sat};
 }
}
'@
$taskCases=@(@{id='native-defaults';threshold=-24;knee=30;ratio=12},@{id='effects-rack-default-kernel';threshold=-24;knee=12;ratio=4},@{id='voice-kernel-static';threshold=-27;knee=6;ratio=4},@{id='effects-extra-limiter';threshold=-1;knee=0;ratio=20},@{id='piano-limiter';threshold=-4;knee=2;ratio=20},@{id='iowa-limiter';threshold=-6;knee=6;ratio=12},@{id='parameter-extremes';threshold=-100;knee=40;ratio=20})
$taskResults=@();foreach($taskCase in $taskCases){$taskResults+=@{id=$taskCase.id;parameters=@($taskCase.threshold,$taskCase.knee,$taskCase.ratio);curve=[UcrtCompressorCurve]::Probe($taskCase.threshold,$taskCase.knee,$taskCase.ratio)}}
$taskDll=Get-Item -LiteralPath "$env:WINDIR\System32\ucrtbase.dll"
$taskReport=@{kind='native-compressor.windows-crt-static-curve';version=1;createdAtUtc=[DateTime]::UtcNow.ToString('o');scope='Independent pinned static-curve arithmetic using actual Windows ucrtbase powf/log10f/exp and Float32 boundaries; no browser PCM fitting. Final makeup uses a rounded binary64 power, matching the documented Chromium fdlibm wrapper boundary.';dll=@{version=$taskDll.VersionInfo.FileVersion;sha256=(Get-FileHash -LiteralPath $taskDll.FullName -Algorithm SHA256).Hash.ToLowerInvariant()};trials=$taskResults}
$taskReport|ConvertTo-Json -Depth 10|Set-Content reports/modular_audio/native-compressor-ucrt-curve.json
$taskResults|ConvertTo-Json -Depth 5
