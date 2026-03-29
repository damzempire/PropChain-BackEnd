import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface CodeExample {
  id: string;
  language: string;
  title: string;
  description: string;
  code: string;
  endpoint: string;
  method: string;
  parameters?: Record<string, any>;
  headers?: Record<string, string>;
  body?: any;
  tags?: string[];
}

export interface ExampleConfig {
  includeAuthentication: boolean;
  includeErrorHandling: boolean;
  includeComments: boolean;
  baseUrl?: string;
  apiKey?: string;
  token?: string;
}

@Injectable()
export class ExampleGenerator {
  private readonly logger = new Logger(ExampleGenerator.name);
  private examples: Map<string, CodeExample[]> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate code examples for different programming languages
   */
  generateExamples(
    endpoint: string,
    method: string,
    description: string,
    config: ExampleConfig = { includeAuthentication: true, includeErrorHandling: true, includeComments: true }
  ): CodeExample[] {
    const baseUrl = config.baseUrl || this.configService.get('API_BASE_URL', 'http://localhost:3000');
    const examples: CodeExample[] = [];

    // JavaScript/Node.js example
    examples.push(this.generateJavaScriptExample(endpoint, method, description, baseUrl, config));

    // Python example
    examples.push(this.generatePythonExample(endpoint, method, description, baseUrl, config));

    // cURL example
    examples.push(this.generateCurlExample(endpoint, method, description, baseUrl, config));

    // TypeScript example
    examples.push(this.generateTypeScriptExample(endpoint, method, description, baseUrl, config));

    // Java example
    examples.push(this.generateJavaExample(endpoint, method, description, baseUrl, config));

    // C# example
    examples.push(this.generateCSharpExample(endpoint, method, description, baseUrl, config));

    // Go example
    examples.push(this.generateGoExample(endpoint, method, description, baseUrl, config));

    // PHP example
    examples.push(this.generatePhpExample(endpoint, method, description, baseUrl, config));

    // Store examples for endpoint
    const key = `${method}:${endpoint}`;
    this.examples.set(key, examples);

    this.logger.log(`Generated ${examples.length} code examples for ${method} ${endpoint}`);
    return examples;
  }

  /**
   * Get examples for endpoint
   */
  getExamples(endpoint: string, method: string): CodeExample[] {
    const key = `${method}:${endpoint}`;
    return this.examples.get(key) || [];
  }

  /**
   * Generate JavaScript/Node.js example
   */
  private generateJavaScriptExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `// ${description}\n`;
      code += `// Generated JavaScript example for ${method} ${endpoint}\n\n`;
    }

    code += 'const axios = require(\'axios\');\n\n';

    if (config.includeAuthentication) {
      code += '// Configure authentication\n';
      code += 'const apiKey = process.env.API_KEY || \'your-api-key\';\n';
      code += 'const token = process.env.TOKEN || \'your-jwt-token\';\n\n';
    }

    code += 'const config = {\n';
    code += `  method: '${method.toLowerCase()}',\n`;
    code += `  url: '${baseUrl}${endpoint}',\n`;
    code += '  headers: {\n';
    code += '    \'Content-Type\': \'application/json\',\n';

    if (config.includeAuthentication) {
      code += '    \'X-API-Key\': apiKey,\n';
      code += '    \'Authorization\': `Bearer ${token}`,\n';
    }

    code += '  },\n';

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += '  data: {\n';
      code += '    // Add your request body here\n';
      code += '    example: \'data\',\n';
      code += '  },\n';
    }

    code += '};\n\n';

    if (config.includeErrorHandling) {
      code += 'axios(config)\n';
      code += '  .then(response => {\n';
      code += '    console.log(\'Status:\', response.status);\n';
      code += '    console.log(\'Data:\', response.data);\n';
      code += '  })\n';
      code += '  .catch(error => {\n';
      code += '    console.error(\'Error:\', error.response?.data || error.message);\n';
      code += '  });\n';
    } else {
      code += 'axios(config)\n';
      code += '  .then(response => console.log(response.data))\n';
      code += '  .catch(error => console.error(error));\n';
    }

    return {
      id: `js-${method}-${endpoint}`,
      language: 'javascript',
      title: 'JavaScript/Node.js',
      description,
      code,
      endpoint,
      method,
      tags: ['javascript', 'nodejs', 'axios'],
    };
  }

  /**
   * Generate Python example
   */
  private generatePythonExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `# ${description}\n`;
      code += `# Generated Python example for ${method} ${endpoint}\n\n`;
    }

    code += 'import requests\n';
    code += 'import os\n\n';

    if (config.includeAuthentication) {
      code += '# Configure authentication\n';
      code += 'api_key = os.getenv(\'API_KEY\', \'your-api-key\')\n';
      code += 'token = os.getenv(\'TOKEN\', \'your-jwt-token\')\n\n';
    }

    code += 'url = f"{}"\n\n'.replace('{}', baseUrl + endpoint);
    code += 'headers = {\n';
    code += '    "Content-Type": "application/json",\n';

    if (config.includeAuthentication) {
      code += '    "X-API-Key": api_key,\n';
      code += '    "Authorization": f"Bearer {token}",\n';
    }

    code += '}\n\n';

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += 'data = {\n';
      code += '    "example": "data",  # Add your request body here\n';
      code += '}\n\n';
    }

    code += 'try:\n';
    code += `    response = requests.${method.toLowerCase()}(url, headers=headers`;

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += ', json=data';
    }

    code += ')\n';
    code += '    response.raise_for_status()\n';
    code += '    print(f"Status: {response.status_code}")\n';
    code += '    print(f"Data: {response.json()}")\n';

    if (config.includeErrorHandling) {
      code += 'except requests.exceptions.RequestException as e:\n';
      code += '    print(f"Error: {e}")\n';
    }

    return {
      id: `python-${method}-${endpoint}`,
      language: 'python',
      title: 'Python',
      description,
      code,
      endpoint,
      method,
      tags: ['python', 'requests'],
    };
  }

  /**
   * Generate cURL example
   */
  private generateCurlExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `# ${description}\n`;
      code += `# Generated cURL example for ${method} ${endpoint}\n\n`;
    }

    code += `curl -X ${method.toUpperCase()} \\\n`;
    code += `  '${baseUrl}${endpoint}' \\\n`;
    code += '  -H \'Content-Type: application/json\' \\\n';

    if (config.includeAuthentication) {
      code += '  -H \'X-API-Key: your-api-key\' \\\n';
      code += '  -H \'Authorization: Bearer your-jwt-token\' \\\n';
    }

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += '  -d \'{"example": "data"}\' \\\n';
    }

    code += '  -v';

    return {
      id: `curl-${method}-${endpoint}`,
      language: 'bash',
      title: 'cURL',
      description,
      code,
      endpoint,
      method,
      tags: ['curl', 'bash', 'command-line'],
    };
  }

  /**
   * Generate TypeScript example
   */
  private generateTypeScriptExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `// ${description}\n`;
      code += `// Generated TypeScript example for ${method} ${endpoint}\n\n`;
    }

    code += 'import axios from \'axios\';\n\n';

    if (config.includeAuthentication) {
      code += '// Configure authentication\n';
      code += 'const apiKey = process.env.API_KEY || \'your-api-key\';\n';
      code += 'const token = process.env.TOKEN || \'your-jwt-token\';\n\n';
    }

    code += 'interface ApiResponse<T> {\n';
    code += '  data: T;\n';
    code += '  status: number;\n';
    code += '  statusText: string;\n';
    code += '}\n\n';

    code += `async function ${method.toLowerCase()}Api(): Promise<void> {\n`;
    code += '  try {\n';
    code += '    const config = {\n';
    code += `      method: '${method.toLowerCase()}' as const,\n`;
    code += `      url: '${baseUrl}${endpoint}',\n`;
    code += '      headers: {\n';
    code += '        \'Content-Type\': \'application/json\',\n';

    if (config.includeAuthentication) {
      code += '        \'X-API-Key\': apiKey,\n';
      code += '        \'Authorization\': `Bearer ${token}`,\n';
    }

    code += '      },\n';

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += '      data: {\n';
      code += '        example: \'data\',\n';
      code += '      },\n';
    }

    code += '    };\n\n';
    code += '    const response = await axios(config);\n';
    code += '    console.log(\'Status:\', response.status);\n';
    code += '    console.log(\'Data:\', response.data);\n';

    if (config.includeErrorHandling) {
      code += '  } catch (error: any) {\n';
      code += '    console.error(\'Error:\', error.response?.data || error.message);\n';
      code += '  }\n';
    }

    code += '}\n\n';
    code += `${method.toLowerCase()}Api();`;

    return {
      id: `typescript-${method}-${endpoint}`,
      language: 'typescript',
      title: 'TypeScript',
      description,
      code,
      endpoint,
      method,
      tags: ['typescript', 'axios'],
    };
  }

  /**
   * Generate Java example
   */
  private generateJavaExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `// ${description}\n`;
      code += `// Generated Java example for ${method} ${endpoint}\n\n`;
    }

    code += 'import java.net.http.HttpClient;\n';
    code += 'import java.net.http.HttpRequest;\n';
    code += 'import java.net.http.HttpResponse;\n';
    code += 'import java.net.URI;\n';
    code += 'import java.time.Duration;\n\n';

    code += 'public class ApiClient {\n';
    code += '    private static final String BASE_URL = "' + baseUrl + '";\n';
    code += '    private static final String API_KEY = System.getenv("API_KEY");\n';
    code += '    private static final String TOKEN = System.getenv("TOKEN");\n\n';

    code += `    public static void ${method.toLowerCase()}Api() throws Exception {\n`;
    code += '        HttpClient client = HttpClient.newBuilder()\n';
    code += '                .connectTimeout(Duration.ofSeconds(10))\n';
    code += '                .build();\n\n';

    let requestBody = '';
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      requestBody = '"{\\"example\\": \\"data\\"}"';
    }

    code += '        HttpRequest request = HttpRequest.newBuilder()\n';
    code += `                .uri(URI.create("${baseUrl}${endpoint}"))\n`;
    code += `                .method("${method.toUpperCase()", HttpRequest.BodyPublishers.ofString(${requestBody || '""'}))\n`;
    code += '                .header("Content-Type", "application/json")\n';

    if (config.includeAuthentication) {
      code += '                .header("X-API-Key", API_KEY)\n';
      code += '                .header("Authorization", "Bearer " + TOKEN)\n';
    }

    code += '                .build();\n\n';

    if (config.includeErrorHandling) {
      code += '        try {\n';
      code += '            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\n';
      code += '            System.out.println("Status: " + response.statusCode());\n';
      code += '            System.out.println("Data: " + response.body());\n';
      code += '        } catch (Exception e) {\n';
      code += '            System.err.println("Error: " + e.getMessage());\n';
      code += '        }\n';
    }

    code += '    }\n';
    code += '}';

    return {
      id: `java-${method}-${endpoint}`,
      language: 'java',
      title: 'Java',
      description,
      code,
      endpoint,
      method,
      tags: ['java', 'http-client'],
    };
  }

  /**
   * Generate C# example
   */
  private generateCSharpExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `// ${description}\n`;
      code += `// Generated C# example for ${method} ${endpoint}\n\n`;
    }

    code += 'using System;\n';
    code += 'using System.Net.Http;\n';
    code += 'using System.Text;\n';
    code += 'using System.Threading.Tasks;\n\n';

    code += 'public class ApiClient\n';
    code += '{\n';
    code += '    private static readonly HttpClient client = new HttpClient();\n';
    code += '    private static readonly string BaseUrl = "' + baseUrl + '";\n\n';

    code += `    public static async Task ${method.capitalize()}Api()\n`;
    code += '    {\n';
    code += '        try\n';
    code += '        {\n';
    code += '            var request = new HttpRequestMessage\n';
    code += '            {\n';
    code += `                Method = HttpMethod.${method.capitalize()},\n`;
    code += `                RequestUri = new Uri("${baseUrl}${endpoint}"),\n`;
    code += '            };\n\n';
    code += '            request.Headers.Add("Content-Type", "application/json");\n';

    if (config.includeAuthentication) {
      code += '            request.Headers.Add("X-API-Key", Environment.GetEnvironmentVariable("API_KEY"));\n';
      code += '            request.Headers.Add("Authorization", "Bearer " + Environment.GetEnvironmentVariable("TOKEN"));\n';
    }

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += '            var content = "{\\"example\\": \\"data\\"}";\n';
      code += '            request.Content = new StringContent(content, Encoding.UTF8, "application/json");\n';
    }

    code += '\n';
    code += '            var response = await client.SendAsync(request);\n';
    code += '            Console.WriteLine($"Status: {response.StatusCode}");\n';
    code += '            var responseContent = await response.Content.ReadAsStringAsync();\n';
    code += '            Console.WriteLine($"Data: {responseContent}");\n';

    if (config.includeErrorHandling) {
      code += '        }\n';
      code += '        catch (Exception ex)\n';
      code += '        {\n';
      code += '            Console.WriteLine($"Error: {ex.Message}");\n';
      code += '        }\n';
    }

    code += '    }\n';
    code += '}';

    return {
      id: `csharp-${method}-${endpoint}`,
      language: 'csharp',
      title: 'C#',
      description,
      code,
      endpoint,
      method,
      tags: ['csharp', 'httpclient'],
    };
  }

  /**
   * Generate Go example
   */
  private generateGoExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `// ${description}\n`;
      code += `// Generated Go example for ${method} ${endpoint}\n\n`;
    }

    code += 'package main\n\n';
    code += 'import (\n';
    code += '    "bytes"\n';
    code += '    "encoding/json"\n';
    code += '    "fmt"\n';
    code += '    "io/ioutil"\n';
    code += '    "net/http"\n';
    code += '    "os"\n';
    code += ')\n\n';

    code += 'func main() {\n';
    code += `    url := "${baseUrl}${endpoint}"\n\n`;

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += '    data := map[string]string{"example": "data"}\n';
      code += '    jsonData, _ := json.Marshal(data)\n\n';
    }

    code += '    req, err := http.NewRequest("' + method.toUpperCase() + '", url, ';

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += 'bytes.NewBuffer(jsonData))\n';
    } else {
      code += 'nil)\n';
    }

    code += '    if err != nil {\n';
    code += '        fmt.Printf("Error creating request: %v\\n", err)\n';
    code += '        return\n';
    code += '    }\n\n';
    code += '    req.Header.Set("Content-Type", "application/json")\n';

    if (config.includeAuthentication) {
      code += '    req.Header.Set("X-API-Key", os.Getenv("API_KEY"))\n';
      code += '    req.Header.Set("Authorization", "Bearer "+os.Getenv("TOKEN"))\n';
    }

    code += '\n';
    code += '    client := &http.Client{}\n';
    code += '    resp, err := client.Do(req)\n';
    code += '    if err != nil {\n';
    code += '        fmt.Printf("Error sending request: %v\\n", err)\n';
    code += '        return\n';
    code += '    }\n';
    code += '    defer resp.Body.Close()\n\n';
    code += '    body, err := ioutil.ReadAll(resp.Body)\n';
    code += '    if err != nil {\n';
    code += '        fmt.Printf("Error reading response: %v\\n", err)\n';
    code += '        return\n';
    code += '    }\n\n';
    code += '    fmt.Printf("Status: %s\\n", resp.Status)\n';
    code += '    fmt.Printf("Data: %s\\n", string(body))\n';
    code += '}';

    return {
      id: `go-${method}-${endpoint}`,
      language: 'go',
      title: 'Go',
      description,
      code,
      endpoint,
      method,
      tags: ['go', 'http'],
    };
  }

  /**
   * Generate PHP example
   */
  private generatePhpExample(
    endpoint: string,
    method: string,
    description: string,
    baseUrl: string,
    config: ExampleConfig
  ): CodeExample {
    let code = '';

    if (config.includeComments) {
      code += `<?php\n`;
      code += `// ${description}\n`;
      code += `// Generated PHP example for ${method} ${endpoint}\n\n`;
    } else {
      code += '<?php\n\n';
    }

    code += '$url = "' + baseUrl + endpoint + '";\n\n';

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += '$data = json_encode([\n';
      code += '    "example" => "data"\n';
      code += ']);\n\n';
    }

    code += '$headers = [\n';
    code += '    "Content-Type: application/json",\n';

    if (config.includeAuthentication) {
      code += '    "X-API-Key: " . getenv("API_KEY"),\n';
      code += '    "Authorization: Bearer " . getenv("TOKEN"),\n';
    }

    code += '];\n\n';

    code += '$ch = curl_init();\n';
    code += 'curl_setopt($ch, CURLOPT_URL, $url);\n';
    code += `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${method.toUpperCase()}");\n`;

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      code += 'curl_setopt($ch, CURLOPT_POSTFIELDS, $data);\n';
    }

    code += 'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n';
    code += 'curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);\n\n';

    if (config.includeErrorHandling) {
      code += '$response = curl_exec($ch);\n';
      code += '$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);\n';
      code += 'if (curl_errno($ch)) {\n';
      code += '    echo "Error: " . curl_error($ch);\n';
      code += '} else {\n';
      code += '    echo "Status: " . $httpCode . "\\n";\n';
      code += '    echo "Data: " . $response . "\\n";\n';
      code += '}\n';
    } else {
      code += '$response = curl_exec($ch);\n';
      code += 'echo $response;\n';
    }

    code += '\ncurl_close($ch);';

    return {
      id: `php-${method}-${endpoint}`,
      language: 'php',
      title: 'PHP',
      description,
      code,
      endpoint,
      method,
      tags: ['php', 'curl'],
    };
  }

  /**
   * Export all examples to files
   */
  exportExamples(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const [endpoint, examples] of this.examples.entries()) {
      const endpointDir = path.join(outputDir, endpoint.replace(/[^a-zA-Z0-9]/g, '_'));
      if (!fs.existsSync(endpointDir)) {
        fs.mkdirSync(endpointDir, { recursive: true });
      }

      for (const example of examples) {
        const fileName = `${example.language}.${this.getFileExtension(example.language)}`;
        const filePath = path.join(endpointDir, fileName);
        fs.writeFileSync(filePath, example.code);
      }
    }

    this.logger.log(`Exported examples to ${outputDir}`);
  }

  /**
   * Get file extension for language
   */
  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      csharp: 'cs',
      go: 'go',
      php: 'php',
      bash: 'sh',
    };
    return extensions[language] || 'txt';
  }
}

// Helper function for C# example
String.prototype.capitalize = function() {
  return this.charAt(0).toUpperCase() + this.slice(1);
};
