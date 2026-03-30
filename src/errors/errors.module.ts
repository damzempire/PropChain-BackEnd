import { Module } from '@nestjs/common';
import { ErrorClassifier } from './ErrorClassifier';
import { RecoveryManager } from './RecoveryManager';
import { IncidentResponder } from './IncidentResponder';

@Module({
  providers: [ErrorClassifier, RecoveryManager, IncidentResponder],
  exports: [ErrorClassifier, RecoveryManager, IncidentResponder],
})
export class ErrorsModule {}
