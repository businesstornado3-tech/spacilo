import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FaqAccordion({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  return (
    <Accordion type="single" collapsible className="mt-6">
      {items.map((item, i) => (
        <AccordionItem key={item.question} value={`faq-${i}`}>
          <AccordionTrigger className="type-body">{item.question}</AccordionTrigger>
          <AccordionContent className="type-body-sm text-muted-foreground">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
