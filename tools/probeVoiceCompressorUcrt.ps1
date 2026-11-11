# Independent read-only system math comparison at exact failing coefficients.
# Curve equations derive from pinned Google/Apple BSD DynamicsCompressor.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VoiceCrtCurveProbe {
 [DllImport("ucrtbase.dll",CallingConvention=CallingConvention.Cdecl)]public static extern float powf(float x,float y);
 [DllImport("ucrtbase.dll",CallingConvention=CallingConvention.Cdecl)]public static extern float log10f(float x);
 [DllImport("ucrtbase.dll",CallingConvention=CallingConvention.Cdecl)]public static extern double exp(double x);
 static float DB(float x){return 20*log10f(x);}static float Lin(float x){return powf(10,.05f*x);}
 static float Curve(float x,float k,float t){return x<t?x:t+(1-(float)exp((double)(-k*(x-t))))/k;}
 public static double[] Probe(float td,float kd,float ratio){float t=Lin(td),dx=td+kd,x=Lin(dx),x2=(float)((double)x*1.001),dx2=DB(x2),min=.1f,max=10000,k=5;for(int i=0;i<15;i++){float slope=x<t?1:(DB(Curve(x2,k,t))-DB(Curve(x,k,t)))/(dx2-dx);if(slope<1/ratio)max=k;else min=k;k=(float)Math.Sqrt(min*max);}float y=DB(Curve(x,k,t)),sat=1<x?Curve(1,k,t):Lin(y+1/ratio*(0-dx));return new double[]{k,t,x,y,(float)Math.Pow(1/sat,.6f),sat};}
}
'@
$taskInput=Get-Content reports/modular_audio/voice-compressor-quantum-curve.json -Raw|ConvertFrom-Json
$taskResults=@();foreach($taskPoint in $taskInput.probes){$taskResults+=@{frame=$taskPoint.frame;parameters=$taskPoint.parameters;owned=$taskPoint.curve;crt=[VoiceCrtCurveProbe]::Probe($taskPoint.parameters[0],$taskPoint.parameters[1],$taskPoint.parameters[2])}}
$taskReport=@{kind='voice-compressor.failing-quantum-crt-comparison';version=1;createdAtUtc=[DateTime]::UtcNow.ToString('o');scope='Independent source-identical static curve using existing system math DLL functions. This does not prove browser DLL linkage and does not alter accepted kernels or fit audio output.';trials=$taskResults}
$taskReport|ConvertTo-Json -Depth 12|Set-Content reports/modular_audio/voice-compressor-quantum-ucrt.json
$taskResults|ConvertTo-Json -Depth 8
