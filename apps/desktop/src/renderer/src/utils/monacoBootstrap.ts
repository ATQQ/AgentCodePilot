import { setupMonacoWorkers } from './monacoWorkers'

setupMonacoWorkers()

// stream-monaco / markstream load editor.api first unless the full bundle is already
// registered. Import every contribution + service up front.
import 'monaco-editor'
