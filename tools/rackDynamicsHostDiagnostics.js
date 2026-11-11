export function appendHostCheckFailure(report,message){report.checksPassed=false;if(report.error)(report.secondaryCheckErrors??=[]).push(message);else report.error=message;return report;}
