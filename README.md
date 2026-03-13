# TaxRefund OCR Pipeline

This project is a receipt-scanning mobile app built with Expo / React Native. For interview purposes, the most important part of the project is not the UI, but the OCR pipeline: how raw receipt images are converted into structured financial data with a combination of AWS Textract, rule-based parsing, and LLM-assisted post-processing.

## What This Project Demonstrates

This project was built to explore a practical OCR extraction pipeline for messy, real-world receipts.

The main engineering goals were:

- extract core fields such as vendor, date, total, subtotal, tax, and line items
- improve accuracy on noisy OCR output instead of relying on a single model response
- iterate on multiple Textract APIs and fallback strategies
- combine deterministic regex rules with LLM-based recovery
- keep the final output structured enough for downstream tax/deduction workflows

## OCR Architecture

The current OCR flow is:

1. The mobile app captures a receipt image with `expo-camera`
2. The client converts the image to Base64
3. The image is sent to an AWS Lambda endpoint
4. Lambda first tries `Textract AnalyzeExpense`
5. If the result is empty or missing core fields, Lambda falls back to `Textract AnalyzeDocument`
6. Structured and semi-structured outputs are normalized
7. An LLM is used as a post-processing layer to recover missing values and clean ambiguous OCR output
8. Additional regex-based parsing on the app/service side extracts fields from raw text when structured extraction is incomplete

This hybrid approach is intentional: no single layer was reliable enough on its own.

### Current Synchronous AWS Architecture

This is the current architecture implemented in the project.

```text
[Mobile App]
    |
    | capture receipt image
    v
[Expo / React Native Client]
    |
    | Base64 image payload over HTTPS
    v
[API Gateway]
    |
    v
[AWS Lambda OCR Handler]
    |
    |-- try --> [Textract AnalyzeExpense]
    |-- fallback -> [Textract AnalyzeDocument]
    |
    |-- optional recovery --> [Bedrock Claude]
    v
[Merged Structured Result]
    |
    v
[Client UI + Local Storage]
```

Why this synchronous version was a good starting point:

- simple to build and demo quickly
- easy to debug end-to-end
- good for validating OCR quality before adding infrastructure complexity
- enough for low-volume usage and interview demonstration

Its limitations:

- the client waits for the full OCR round trip
- long-running OCR/LLM calls can hurt UX
- retries, rate limits, and job tracking are limited
- it is not ideal for higher throughput or production-scale processing

### Production-Oriented Asynchronous AWS Architecture

If I were evolving this into a more production-ready design, I would move to an async job architecture.

```text
[Mobile App]
    |
    | upload image / create job
    v
[API Gateway]
    |
    v
[Lambda: Create Job]
    |
    |-- store original image --> [S3]
    |-- write job metadata --> [DynamoDB]
    |-- enqueue work -------> [SQS]
                                |
                                v
                        [Lambda Worker / Step Functions]
                                |
                                |-- OCR --> [Textract]
                                |-- recovery --> [Bedrock Claude]
                                |-- validation / merge --> [Rules Engine]
                                v
                        [DynamoDB Job Result]
                                |
                                v
                      [Client Polling or Webhook/Event Push]
```

Why the async version is stronger for production:

- decouples upload from processing
- supports retries and dead-letter queues
- scales better for bursts of receipt uploads
- enables per-stage observability and cost control
- makes it easier to add confidence scoring, human review, and reprocessing

## Architecture Evolution

I would describe the project evolution in versions rather than as a single static design.

### V1: Basic OCR Prototype

- mobile app sends image to Lambda
- Lambda uses a simple Textract text detection flow
- output is mostly raw text

What it proved:

- the end-to-end pipeline worked
- text extraction was possible
- raw OCR alone was not enough for usable finance data

### V2: OCR + Regex Parsing

- added regex-based field extraction for date, total, vendor, and line items
- introduced deterministic parsing and text cleanup

What improved:

- lower-cost structured extraction
- much better results on common receipt formats
- easier debugging because each rule was inspectable

What still failed:

- noisy OCR text
- irregular layouts
- partial semantic understanding

### V3: Receipt-Specific Textract with `AnalyzeExpense`

- moved from generic text extraction toward receipt-aware AWS OCR
- used `AnalyzeExpense` to get summary fields and line item groups

What improved:

- cleaner merchant/date/total extraction on good receipts
- less dependence on custom parsing for standard cases

What still failed:

- incomplete fields on some receipts
- inconsistent line-item quality

### V4: `AnalyzeDocument` Fallback + Block Heuristics

- added fallback from `AnalyzeExpense` to `AnalyzeDocument`
- parsed `Blocks` to reconstruct layout
- introduced coordinate-based line grouping and item-price extraction

What improved:

- stronger resilience when the receipt-specific API underperformed
- better recovery from layout-heavy receipts
- more control over how OCR output was interpreted

### V5: LLM Recovery Layer

- added Bedrock Claude to post-process OCR text into normalized JSON
- used LLM output as a recovery path, not as the sole parser

What improved:

- better handling of ambiguous or broken OCR output
- improved extraction recall on messy receipts
- reduced the need for endless rule writing on edge cases

Tradeoff introduced:

- higher inference cost
- lower determinism

### V6: Productionization Roadmap

This is the next architecture step rather than a fully implemented stage.

- move from synchronous request/response to async job processing
- store images in S3 and metadata/results in DynamoDB
- add SQS or Step Functions for orchestration
- add confidence scoring, retries, observability, and cost gating
- support human correction for low-confidence outputs

## Why A Hybrid Pipeline

Receipts are messy. In practice, the failures were rarely "no text at all". The real failures were:

- vendor names split across lines
- totals recognized but not labeled correctly
- line items extracted inconsistently
- OCR confusion such as `O` vs `0`, `S` vs `$`, or broken spacing
- receipt-specific APIs returning partial data rather than truly usable data

Because of that, I designed the pipeline in layers:

- Textract for primary OCR and structured extraction
- block/layout heuristics for spatial reconstruction
- regex for deterministic field extraction
- LLM for semantic repair and missing-field recovery

## Textract API Iteration

One of the core parts of this project was iterating across multiple Textract APIs instead of assuming one endpoint would solve the problem.

### Version 1: `AnalyzeExpense`

`AnalyzeExpense` was the first choice because it is designed for receipts and invoices. It works well when AWS can confidently identify receipt-specific fields such as merchant name, date, and total.

Strengths:

- returns receipt-oriented summary fields
- often gives cleaner vendor/date/total extraction
- can return line-item groups directly

Limitations I ran into:

- sometimes returned partial data with missing core fields
- sometimes recognized content but did not expose it in a useful structure
- line items were not consistently reliable enough across different receipt formats

### Version 2: `AnalyzeDocument` Fallback

When `AnalyzeExpense` returned empty or incomplete core fields, I added a fallback to `AnalyzeDocument` with `FORMS` and `TABLES`.

Why this helped:

- it exposed lower-level `Blocks`
- I could reconstruct plain text from `LINE` blocks
- I could build custom parsing logic instead of depending entirely on AWS labels
- it gave me a second path when the receipt-specific API failed semantically

This was an important design change: instead of treating OCR as a one-shot API call, I treated it as a multi-stage extraction problem with fallback paths.

Relevant implementation:

- [lambda/ocr.js](/home/jimmy/WebstormProjects/TaxRefund/TaxRefund/lambda/ocr.js)

## Block-Based Parsing Heuristics

Once I started using `AnalyzeDocument`, I added custom parsing over Textract blocks instead of relying only on raw text.

The Lambda parser:

- groups `LINE` blocks by Y coordinate
- sorts tokens by X coordinate
- reconstructs line order spatially
- detects item-price patterns
- extracts likely totals, payment amounts, change, dates, and vendor candidates
- normalizes common OCR mistakes before parsing

This was useful because receipt OCR is often more about layout recovery than plain text recognition.

Examples of OCR normalization handled in code:

- `S` -> `$`
- `O` -> `0`
- `l` / `I` -> `1`
- `×` / `=` -> `x`

## Regex Parsing Strategy

Regex is a major part of this project, not just a small helper.

I used regex in the service layer to deterministically extract fields from raw OCR text when structured extraction was weak or incomplete.

Key rule categories include:

- date extraction with multiple date formats
- amount extraction using labeled totals and largest-valid-amount fallback
- vendor extraction from meaningful first lines and known vendor keywords
- line-item extraction such as:
  - `2x Item Name`
  - `Item Name 35.00`
  - adjacent-line item/price reconstruction
- key-value reconstruction such as:
  - `TOTAL: 117.00`
  - `CASH 120.00`
  - standalone amount lines

The regex layer was useful for two reasons:

- it gave deterministic behavior for common receipt patterns
- it acted as a safety net when cloud OCR returned plain text but weak structure

Relevant implementation:

- [services/receipt-ocr.ts](/home/jimmy/WebstormProjects/TaxRefund/TaxRefund/services/receipt-ocr.ts)

## LLM Post-Processing

I used an LLM as a post-processing layer, not as the only parser.

In Lambda, after OCR text is extracted, the pipeline can send the receipt text to Bedrock Claude and ask it to return normalized JSON with:

- vendor
- date
- totalAmount
- subtotalAmount
- taxAmount
- items

Why I added the LLM layer:

- to recover fields that Textract detected imperfectly
- to fix OCR mistakes in context
- to infer structure from semi-broken receipt text
- to fill gaps when the deterministic parser was too strict

Why I did not rely on the LLM alone:

- deterministic fields such as totals should be validated, not blindly trusted
- LLMs can hallucinate or over-normalize
- regex and structured OCR are better when the pattern is already clear

So the final merge strategy is conservative:

- use Textract structured data first when available
- use block-based parsing next
- use LLM output as recovery / completion
- preserve deterministic extraction paths whenever possible

## OCR + Regex vs OCR + LLM

One of the main architectural questions in this project is how to balance cost and accuracy.

### Option 1: OCR + Regex

This architecture uses OCR as the text extraction layer and regex / heuristics as the structured parsing layer.

Advantages:

- lowest inference cost after OCR
- deterministic and easy to debug
- fast for stable receipt patterns
- good for extracting standard fields like dates, totals, and simple item-price lines

Disadvantages:

- brittle when OCR text is noisy
- hard to generalize across different receipt layouts
- requires continuous rule tuning
- struggles when labels are missing, malformed, or semantically ambiguous

In short:

- lower cost
- lower adaptability
- good precision on known patterns
- weaker recall on messy real-world receipts

### Option 2: OCR + LLM

This architecture uses OCR for text extraction and an LLM for semantic parsing and recovery.

Advantages:

- better at handling broken text and irregular layouts
- can infer missing structure from context
- more robust when OCR output is partially correct but not well formatted
- reduces the amount of custom rule-writing needed for edge cases

Disadvantages:

- higher cost per document
- slower than regex-based parsing
- less deterministic
- may hallucinate fields or over-correct OCR output

In short:

- higher cost
- higher flexibility
- stronger recall on messy inputs
- needs validation because semantic inference is not guaranteed to be correct

### Why I Combined Them

For this project, neither approach was sufficient alone.

`OCR + Regex` is cheaper and more deterministic, so it is the better default for fields that match known patterns.

`OCR + LLM` is more expensive, but it improves robustness when:

- Textract returns incomplete structure
- labels are missing
- OCR introduces character-level noise
- the receipt layout is unusual

That is why the final system uses a layered strategy:

- use OCR + structured extraction first
- use regex and heuristics for deterministic parsing
- use the LLM only as a recovery and completion layer

From an interview perspective, the architectural takeaway is simple:

- if the priority is cost and predictability, favor OCR + regex
- if the priority is resilience on messy documents, add OCR + LLM
- if the priority is production robustness, combine both and define clear precedence rules

## Data Merging Strategy

An important part of the work was deciding precedence between competing sources.

The current strategy is roughly:

- prefer parsed structured fields from Textract/block heuristics
- if total is missing, derive it from subtotal + tax when available
- prefer extracted line items from OCR structure
- fall back to LLM items when structured line items are weak
- keep raw text and parsed lines for debugging and UI inspection

This makes the pipeline more debuggable than a black-box OCR result.

## Engineering Tradeoffs

Tradeoffs I made intentionally:

- Accuracy over simplicity: a layered pipeline is more complex, but much more realistic for production OCR.
- Determinism over full automation: regex and heuristics remain important even with LLM support.
- Fallbacks over purity: using both `AnalyzeExpense` and `AnalyzeDocument` increased resilience.
- Recoverability over elegance: retaining raw text, parsed lines, and multiple extraction stages made failures easier to inspect.

## Core Files

- [lambda/ocr.js](/home/jimmy/WebstormProjects/TaxRefund/TaxRefund/lambda/ocr.js): AWS Lambda OCR orchestration, Textract fallback logic, block parsing, LLM post-processing
- [services/receipt-ocr.ts](/home/jimmy/WebstormProjects/TaxRefund/TaxRefund/services/receipt-ocr.ts): regex extraction, text parsing, line-item heuristics, data normalization
- [services/tesseract-ocr.ts](/home/jimmy/WebstormProjects/TaxRefund/TaxRefund/services/tesseract-ocr.ts): mobile-side OCR request client
- [components/receipt-camera.tsx](/home/jimmy/WebstormProjects/TaxRefund/TaxRefund/components/receipt-camera.tsx): receipt capture and OCR invocation flow

## Stack

- Expo
- React Native
- TypeScript
- AWS Lambda
- AWS Textract
- AWS Bedrock Claude
- AsyncStorage

## Running Locally

```bash
npm install
npx expo start
```

Useful scripts:

```bash
npm run android
npm run ios
npm run web
npm run lint
```

## Future Improvements

If I continued this project, the next technical improvements would be:

- move OCR endpoint configuration to environment variables
- add confidence scoring per field instead of a single overall confidence
- add validation rules between regex and LLM outputs
- build a receipt benchmark set and measure extraction accuracy by field
- support human-in-the-loop correction for uncertain extractions
- evolve the current synchronous API flow into an async AWS job architecture using S3, DynamoDB, and SQS or Step Functions
- add structured logging, tracing, and per-stage metrics for Textract fallback rate, LLM usage rate, latency, and cost per receipt
- add LLM invocation gating so the model runs only when OCR structure is incomplete or confidence is low
- separate dev/staging/prod infrastructure and manage it with IaC such as CDK or Terraform
